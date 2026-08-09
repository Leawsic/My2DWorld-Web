import {Blocks} from "./registry";
import {mulberry32} from "./noise";
import {biomeAt, CHUNK_SIZE, WORLD_HEIGHT, hashNoise, spawnX, terrainHeight, type Biome} from "./world";
import type {BlockType} from "./types";
import type {FeaturePlacement} from "./features";

/**
 * Deterministic world-gen structures. Anchors are a jittered lattice indexed by
 * k; every chunk recomputes the same anchors independently and writes only the
 * cells that fall inside it, so structures may span chunk boundaries while
 * regeneration stays exact (mirroring the chunk-local feature system).
 */

export interface StructureDef {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    /** "sx,sy" relative to the structure origin (ground row = sy 0) -> block id. */
    readonly blocks: Record<string, BlockType>;
}

export interface StructureSummary {
    readonly id: string;
    readonly width: number;
    readonly height: number;
}

export interface SavedStructure extends StructureSummary {
    readonly blocks: Record<string, string>;
}

const STRUCTURE_SPACING = 48;
const STRUCTURE_SEED_MIX = 0x5f3759df;
const STRUCTURE_MAX_HALF = 16;
const CLEAR_SPAWN_RADIUS = 12;

const DIRT = Blocks.MY2DWORLD.DIRT.id;
const COBBLE = Blocks.MY2DWORLD.COBBLESTONE.id;
const MOSSY = Blocks.MY2DWORLD.MOSSY_COBBLESTONE.id;
const STONE = Blocks.MY2DWORLD.STONE.id;
const LOG = Blocks.MY2DWORLD.OAK_LOG.id;
const SAND = Blocks.MY2DWORLD.SAND.id;

const hut: StructureDef = {
    id: "hut",
    width: 7,
    height: 6,
    blocks: {
        "0,0": DIRT, "1,0": DIRT, "2,0": DIRT, "3,0": DIRT, "4,0": DIRT, "5,0": DIRT, "6,0": DIRT,
        "0,1": COBBLE, "1,1": COBBLE, "2,1": COBBLE, "4,1": COBBLE, "5,1": COBBLE, "6,1": COBBLE,
        "0,2": COBBLE, "1,2": COBBLE, "2,2": COBBLE, "3,2": COBBLE, "4,2": COBBLE, "5,2": COBBLE, "6,2": COBBLE,
        "0,3": COBBLE, "1,3": COBBLE, "2,3": COBBLE, "4,3": COBBLE, "5,3": COBBLE, "6,3": COBBLE,
        "0,4": LOG, "1,4": LOG, "2,4": LOG, "3,4": LOG, "4,4": LOG, "5,4": LOG, "6,4": LOG,
        "2,5": LOG, "3,5": LOG,
    },
};

const well: StructureDef = {
    id: "well",
    width: 5,
    height: 6,
    blocks: {
        "0,0": COBBLE, "1,0": COBBLE, "3,0": COBBLE, "4,0": COBBLE,
        "0,1": COBBLE, "4,1": COBBLE,
        "0,2": COBBLE, "4,2": COBBLE,
        "0,3": COBBLE, "4,3": COBBLE,
        "0,4": LOG, "4,4": LOG,
        "0,5": LOG, "1,5": LOG, "2,5": LOG, "3,5": LOG, "4,5": LOG,
    },
};

const ruinedArch: StructureDef = {
    id: "ruined_arch",
    width: 5,
    height: 6,
    blocks: {
        "0,0": STONE, "2,0": SAND, "4,0": STONE,
        "0,1": STONE, "1,1": MOSSY, "4,1": STONE,
        "0,2": STONE, "4,2": STONE,
        "0,3": STONE, "1,3": STONE, "3,3": STONE, "4,3": STONE,
        "2,4": STONE,
        "2,5": STONE,
    },
};

const watchtower: StructureDef = {
    id: "watchtower",
    width: 5,
    height: 7,
    blocks: {
        "0,0": COBBLE, "1,0": COBBLE, "2,0": COBBLE, "3,0": COBBLE, "4,0": COBBLE,
        "0,1": COBBLE, "1,1": COBBLE, "3,1": COBBLE, "4,1": COBBLE,
        "0,2": COBBLE, "4,2": COBBLE,
        "0,3": COBBLE, "4,3": COBBLE,
        "0,4": COBBLE, "4,4": COBBLE,
        "0,5": COBBLE, "1,5": COBBLE, "2,5": COBBLE, "3,5": COBBLE, "4,5": COBBLE,
        "0,6": COBBLE, "4,6": COBBLE,
    },
};

const STRUCTURE_POOLS: ReadonlyArray<{biomes: readonly string[]; structures: readonly StructureDef[]; chance: number}> = [
    {biomes: ["plains", "forest"], structures: [hut, well], chance: 0.6},
    {biomes: ["desert"], structures: [ruinedArch], chance: 0.4},
    {biomes: ["mountains"], structures: [watchtower], chance: 0.5},
];

/** Anchor column for lattice index k, jittered within its spacing cell. */
function anchorX(k: number, seed: number): number {
    return k * STRUCTURE_SPACING + Math.floor(hashNoise(k, seed ^ STRUCTURE_SEED_MIX) * STRUCTURE_SPACING);
}

/** Picks the structure for anchor k (or null) from the biome-appropriate pool. */
function structureAt(k: number, seed: number, biome: Biome): StructureDef | null {
    for (const pool of STRUCTURE_POOLS) {
        if (!pool.biomes.includes(biome.id)) continue;
        const rng = mulberry32((seed ^ Math.imul(k, 0x9e3779b9) ^ 0x51ed270b) >>> 0);
        if (rng() >= pool.chance) return null;
        return pool.structures[Math.floor(rng() * pool.structures.length)];
    }
    return null;
}

/**
 * True when a structure's footprint touches column `x` or comes within `margin`
 * columns of it. Used by feature placement and mob spawning so generated trees,
 * plants, rocks and mobs never overlap a structure.
 */
export function structuresNear(x: number, seed: number, margin: number): boolean {
    const kMin = Math.floor((x - margin - STRUCTURE_MAX_HALF) / STRUCTURE_SPACING);
    const kMax = Math.floor((x + margin + STRUCTURE_MAX_HALF) / STRUCTURE_SPACING);
    for (let k = kMin; k <= kMax; k += 1) {
        const anchor = anchorX(k, seed);
        if (Math.abs(anchor - spawnX(seed)) < CLEAR_SPAWN_RADIUS) continue;
        const def = structureAt(k, seed, biomeAt(anchor, seed));
        if (!def) continue;
        const originX = anchor - Math.floor(def.width / 2);
        if (x + margin >= originX && x - margin < originX + def.width) return true;
    }
    return false;
}

export function applyStructures(p: FeaturePlacement): void {
    const kMin = Math.floor((p.startX - STRUCTURE_MAX_HALF) / STRUCTURE_SPACING);
    const kMax = Math.floor((p.startX + CHUNK_SIZE - 1 + STRUCTURE_MAX_HALF) / STRUCTURE_SPACING);
    for (let k = kMin; k <= kMax; k += 1) {
        const anchor = anchorX(k, p.seed);
        if (Math.abs(anchor - p.spawnX) < CLEAR_SPAWN_RADIUS) continue;
        const def = structureAt(k, p.seed, p.biomeOf(anchor));
        if (!def) continue;
        const originX = anchor - Math.floor(def.width / 2);
        if (originX + def.width <= p.startX || originX >= p.startX + CHUNK_SIZE) continue;
        const baseY = terrainHeight(anchor, p.seed);
        for (const [cell, id] of Object.entries(def.blocks)) {
            const comma = cell.indexOf(",");
            const sx = Number(cell.slice(0, comma));
            const sy = Number(cell.slice(comma + 1));
            const x = originX + sx;
            const y = baseY + sy;
            if (x < p.startX || x >= p.startX + CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) continue;
            const num = p.numFor(id);
            if (!num) continue;
            p.blocks[(x - p.startX) * WORLD_HEIGHT + y] = num;
        }
    }
}
