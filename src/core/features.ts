import {Blocks} from "./registry";
import {mulberry32} from "./noise";
import type {BlockType} from "./types";
import type {Biome} from "./world";
import {CHUNK_SIZE, WORLD_HEIGHT} from "./world";

/**
 * Deterministic biome-filtered features (trees, plants, cactus, rocks).
 * Each column samples its own PRNG derived from (x, seed), so regeneration
 * reproduces exactly and no column depends on a neighbour's random stream.
 * Features only ever write into their own chunk — a 2-column margin is kept
 * so trees/rocks never spill past the chunk boundary.
 */

export interface FeaturePlacement {
    readonly blocks: Uint16Array;
    readonly surfaces: Int16Array;
    readonly startX: number;
    readonly numFor: (type: BlockType) => number;
    readonly biomeOf: (x: number) => Biome;
    readonly spawnX: number;
    readonly seed: number;
}

const TREE_MARGIN = 2;
const CLEAR_SPAWN_RADIUS = 8;
const TRUNK_HEIGHT_MIN = 4;
const TRUNK_HEIGHT_MAX = 6;

const TREE_BIOMES: Record<string, number> = {plains: 0.05, forest: 0.12};
const FLOWER_KINDS: BlockType[] = [Blocks.MY2DWORLD.POPPY.id, Blocks.MY2DWORLD.DANDELION.id];

export function applyFeatures(p: FeaturePlacement): void {
    for (let local = 0; local < CHUNK_SIZE; local += 1) {
        const x = p.startX + local;
        const surface = p.surfaces[local];
        const biome = p.biomeOf(x);
        const rng = mulberry32((p.seed ^ Math.imul(x, 0x9e3779b9)) >>> 0);
        const nearSpawn = Math.abs(x - p.spawnX) < CLEAR_SPAWN_RADIUS;

        switch (biome.id) {
            case "desert":
                if (rng() < 0.05 && surface + 3 < WORLD_HEIGHT) placeCactus(p, local, surface, rng);
                break;
            case "snowy":
                break;
            default: {
                if (rng() < 0.4 && surface + 1 < WORLD_HEIGHT) setBlock(p, local, surface + 1, p.numFor(Blocks.MY2DWORLD.SHORT_GRASS.id));
                if (rng() < 0.07 && surface + 1 < WORLD_HEIGHT) setBlock(p, local, surface + 1, p.numFor(FLOWER_KINDS[Math.floor(rng() * FLOWER_KINDS.length)]));
                if (!nearSpawn && rng() < (TREE_BIOMES[biome.id] ?? 0) && local >= TREE_MARGIN && local < CHUNK_SIZE - TREE_MARGIN) {
                    placeTree(p, local, surface, rng);
                }
                if (!nearSpawn && rng() < 0.02 && local >= 1 && local < CHUNK_SIZE - 1) placeRock(p, local, surface, rng);
            }
        }
    }
}

function setBlock(p: FeaturePlacement, local: number, y: number, num: number): void {
    if (y < 1 || y >= WORLD_HEIGHT) return;
    p.blocks[local * WORLD_HEIGHT + y] = num;
}

function cell(p: FeaturePlacement, local: number, y: number): number {
    return p.blocks[local * WORLD_HEIGHT + y];
}

function isAirOrPlant(p: FeaturePlacement, local: number, y: number): boolean {
    const num = cell(p, local, y);
    return num === 0;
}

function placeTree(p: FeaturePlacement, local: number, surface: number, rng: () => number): void {
    const logNum = p.numFor(Blocks.MY2DWORLD.OAK_LOG.id);
    const leavesNum = p.numFor(Blocks.MY2DWORLD.OAK_LEAVES.id);
    if (!logNum || !leavesNum) return;
    const height = TRUNK_HEIGHT_MIN + Math.floor(rng() * (TRUNK_HEIGHT_MAX - TRUNK_HEIGHT_MIN + 1));
    const top = surface + height;
    for (let y = surface + 1; y <= top; y += 1) p.blocks[local * WORLD_HEIGHT + y] = logNum;

    const leafRows = [1, 2, 1];
    let ly = top;
    for (const radius of leafRows) {
        ly += 1;
        for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx === 0 && ly === top + 1) continue;
            const lx = local + dx;
            if (lx < 0 || lx >= CHUNK_SIZE || ly >= WORLD_HEIGHT) continue;
            if (!isAirOrPlant(p, lx, ly)) continue;
            p.blocks[lx * WORLD_HEIGHT + ly] = leavesNum;
        }
    }
}

function placeCactus(p: FeaturePlacement, local: number, surface: number, rng: () => number): void {
    const cactusNum = p.numFor(Blocks.MY2DWORLD.CACTUS.id);
    if (!cactusNum) return;
    const height = 2 + Math.floor(rng() * 2);
    for (let y = surface + 1; y <= Math.min(surface + height, WORLD_HEIGHT - 1); y += 1) p.blocks[local * WORLD_HEIGHT + y] = cactusNum;
}

function placeRock(p: FeaturePlacement, local: number, surface: number, rng: () => number): void {
    const stoneNum = p.numFor(Blocks.MY2DWORLD.COBBLESTONE.id);
    const mossyNum = p.numFor(Blocks.MY2DWORLD.MOSSY_COBBLESTONE.id);
    if (!stoneNum) return;
    setBlock(p, local, surface + 1, rng() < 0.5 ? stoneNum : mossyNum || stoneNum);
    if (surface + 1 < WORLD_HEIGHT) p.blocks[(local + 1) * WORLD_HEIGHT + surface + 1] = stoneNum;
}
