import type {BlockType} from "./types";
import {Blocks} from "./registry";
import {Block} from "./block";
import {blockRegistry} from "./registry";
import {fbm2D} from "./noise";
import {applyFeatures} from "./features";

export const CHUNK_SIZE = 16;
const BEDROCK_THICKNESS = 2;
export const GRASS = Blocks.MY2DWORLD.GRASS_BLOCK.id;
export const DIRT = Blocks.MY2DWORLD.DIRT.id;
export const STONE = Blocks.MY2DWORLD.STONE.id;
export const COBBLESTONE = Blocks.MY2DWORLD.COBBLESTONE.id;
export const MOSSY_COBBLESTONE = Blocks.MY2DWORLD.MOSSY_COBBLESTONE.id;
export const BEDROCK = Blocks.MY2DWORLD.BEDROCK.id;
export const DEEPSLATE = Blocks.MY2DWORLD.DEEPSLATE.id;
export const SAND = Blocks.MY2DWORLD.SAND.id;
export const SNOW = Blocks.MY2DWORLD.SNOW.id;
export const OAK_LOG = Blocks.MY2DWORLD.OAK_LOG.id;
export const OAK_LEAVES = Blocks.MY2DWORLD.OAK_LEAVES.id;
export const SHORT_GRASS = Blocks.MY2DWORLD.SHORT_GRASS.id;
export const POPPY = Blocks.MY2DWORLD.POPPY.id;
export const DANDELION = Blocks.MY2DWORLD.DANDELION.id;
export const CACTUS = Blocks.MY2DWORLD.CACTUS.id;

/** Rock type below this depth becomes deepslate (aligned with 1.18). */
const DEEPSLATE_TOP = 12;
/** Vertical band over which stone and deepslate blend. */
const DEEPSLATE_BAND = 4;

/** Cheese-cave carving: fbm2D(x*fx, y*fy, seed) above this is hollowed. */
const CAVE_X_FREQ = 0.05;
const CAVE_Y_FREQ = 0.14;
const CAVE_THRESHOLD = 0.66;
const CAVE_OCTAVES = 3;
const CAVE_SEED_MIX = 0xca7e;

/** An ore vein: grid cells of `space` blocks spawn a compact disc cluster of ore with probability `chance`. */
interface OreVein {
    readonly type: BlockType;
    readonly deep?: BlockType;
    readonly minY: number;
    readonly maxY: number;
    readonly space: number;
    readonly chance: number;
    readonly radius: number;
    readonly mix: number;
}

const ORE_VEINS: readonly OreVein[] = [
    {type: Blocks.MY2DWORLD.COAL_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_COAL_ORE.id, minY: 4, maxY: 80, space: 16, chance: 0.45, radius: 1.9, mix: 0x111},
    {type: Blocks.MY2DWORLD.IRON_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_IRON_ORE.id, minY: 4, maxY: 64, space: 18, chance: 0.33, radius: 1.8, mix: 0x222},
    {type: Blocks.MY2DWORLD.COPPER_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_COPPER_ORE.id, minY: 4, maxY: 48, space: 18, chance: 0.3, radius: 1.7, mix: 0x333},
    {type: Blocks.MY2DWORLD.GOLD_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_GOLD_ORE.id, minY: 1, maxY: 32, space: 22, chance: 0.25, radius: 1.6, mix: 0x444},
    {type: Blocks.MY2DWORLD.REDSTONE_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_REDSTONE_ORE.id, minY: 1, maxY: 16, space: 22, chance: 0.28, radius: 1.5, mix: 0x555},
    {type: Blocks.MY2DWORLD.LAPIS_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_LAPIS_ORE.id, minY: 1, maxY: 24, space: 24, chance: 0.26, radius: 1.6, mix: 0x666},
    {type: Blocks.MY2DWORLD.DIAMOND_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_DIAMOND_ORE.id, minY: 1, maxY: 12, space: 26, chance: 0.22, radius: 1.5, mix: 0x777},
    {type: Blocks.MY2DWORLD.EMERALD_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_EMERALD_ORE.id, minY: 1, maxY: 10, space: 28, chance: 0.2, radius: 1.4, mix: 0x888},
];

/** A surface generation profile shared by terrain height and block filling. */
export interface Biome {
    readonly id: string;
    readonly base: number;
    readonly amplitude: number;
    readonly detail: number;
    readonly surface: BlockType;
    readonly surfaceDepth: number;
    readonly subSurface: BlockType;
    readonly subDepth: number;
    readonly stone: BlockType;
    readonly stoneVariant: BlockType;
    readonly variantChance: number;
    /** Grass overlay tint, sampled from a temperature/humidity colormap (MC-style). */
    readonly grass: string;
    /** Foliage (leaf) tint for the same colormap. */
    readonly foliage: string;
}

const PLAINS: Biome = {
    id: "plains", base: 46, amplitude: 7, detail: 2.5,
    surface: GRASS, surfaceDepth: 1, subSurface: DIRT, subDepth: 4,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.15,
    grass: "#82c34d", foliage: "#5a9424",
};

/** Neutral tint used for inventory/hotbar icons before a real column is known. */
export const DEFAULT_BIOME: Biome = PLAINS;

const FOREST: Biome = {
    id: "forest", base: 46, amplitude: 6, detail: 3,
    surface: GRASS, surfaceDepth: 1, subSurface: DIRT, subDepth: 4,
    stone: STONE, stoneVariant: MOSSY_COBBLESTONE, variantChance: 0.2,
    grass: "#5d9e33", foliage: "#3d8a1f",
};

const DESERT: Biome = {
    id: "desert", base: 44, amplitude: 6, detail: 3.5,
    surface: SAND, surfaceDepth: 3, subSurface: SAND, subDepth: 4,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.12,
    grass: "#c7b56f", foliage: "#8a9a4f",
};

const SNOWY: Biome = {
    id: "snowy", base: 46, amplitude: 7, detail: 2.5,
    surface: SNOW, surfaceDepth: 1, subSurface: GRASS, subDepth: 2,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.1,
    grass: "#9db98a", foliage: "#8aab77",
};

const MOUNTAINS: Biome = {
    id: "mountains", base: 50, amplitude: 18, detail: 5,
    surface: GRASS, surfaceDepth: 1, subSurface: STONE, subDepth: 2,
    stone: STONE, stoneVariant: MOSSY_COBBLESTONE, variantChance: 0.3,
    grass: "#6daa3c", foliage: "#4f8324",
};

/** Low-frequency temperature/humidity field that drives biome selection. */
interface Climate {
    temp: number;
    hum: number;
}

const RUGGED_FREQ = 0.006;
const RUGGED_SEED = 0x3d1;
const RUGGED_THRESHOLD = 0.62;
const SNOWY_TEMP = 0.3;
const DESERT_TEMP = 0.7;
const HUMIDITY_SPLIT = 0.5;

function climate(x: number, seed: number): Climate {
    return {
        temp: fbm2D(x * 0.004, 0.37, seed ^ 0x9e37, 3),
        hum: fbm2D(x * 0.0032, 0.71, seed ^ 0x5bd1, 3),
    };
}

export function biomeAt(x: number, seed = 0): Biome {
    const {temp, hum} = climate(x, seed);
    if (fbm2D(x * RUGGED_FREQ, 0.5, seed ^ RUGGED_SEED, 3) > RUGGED_THRESHOLD) return MOUNTAINS;
    if (temp < SNOWY_TEMP) return SNOWY;
    if (temp > DESERT_TEMP) return DESERT;
    return hum < HUMIDITY_SPLIT ? PLAINS : FOREST;
}

export const WORLD_HEIGHT = 128;

export class Chunk {
    readonly start: number;
    /** Column-major numeric block ids: index = localX * WORLD_HEIGHT + y; air = 0. */
    readonly blocks = new Uint16Array(CHUNK_SIZE * WORLD_HEIGHT);
    readonly surfaces = new Int16Array(CHUNK_SIZE);

    constructor(readonly x: number, readonly numFor: (type: BlockType) => number, readonly seed: number) {
        this.start = x * CHUNK_SIZE;
        for (let local = 0; local < CHUNK_SIZE; local += 1) {
            const worldX = this.start + local;
            const surface = terrainHeight(worldX, seed);
            this.surfaces[local] = surface;
            const column = local * WORLD_HEIGHT;
            for (let y = 1; y <= surface; y += 1) {
                const type = generatedBlock(worldX, y, surface, seed);
                if (type) this.blocks[column + y] = numFor(type);
            }
        }
        applyFeatures({
            blocks: this.blocks,
            surfaces: this.surfaces,
            startX: this.start,
            numFor,
            biomeOf: (worldX) => biomeAt(worldX, seed),
            spawnX: spawnX(seed),
            seed,
        });
    }

    blockAt(localX: number, y: number): number {
        return this.blocks[localX * WORLD_HEIGHT + y];
    }

    setBlock(localX: number, y: number, num: number): void {
        this.blocks[localX * WORLD_HEIGHT + y] = num;
    }

    encode(): string {
        const bytes = new Uint8Array(this.blocks.length * 2);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < this.blocks.length; i += 1) view.setUint16(i * 2, this.blocks[i], true);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
    }
}

/** Decodes a base64 chunk into a Uint16Array of the expected length, or null. */
export function decodeChunk(base64: string): Uint16Array | null {
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        if (bytes.length % 2 !== 0 || bytes.length / 2 !== CHUNK_SIZE * WORLD_HEIGHT) return null;
        const data = new Uint16Array(bytes.length / 2);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < data.length; i += 1) data[i] = view.getUint16(i * 2, true);
        return data;
    } catch {
        return null;
    }
}

export function hashNoise(x: number, seed = 0): number {
    let h = Math.imul(x ^ seed, 374761393) + 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) & 0x7fffffff) / 0x7fffffff;
}

export function hashSeed(input: string): number {
    let h = 5381;
    for (let i = 0; i < input.length; i += 1) h = Math.imul(h, 33) ^ input.charCodeAt(i);
    return h >>> 0;
}

export function spawnX(seed = 0): number {
    if (seed === 0) return 0;
    return Math.floor((hashNoise(seed) - 0.5) * 400);
}

export function terrainHeight(x: number, seed = 0): number {
    const biome = biomeAt(x, seed);
    const roll = fbm2D(x * 0.008, 0.21, seed, 4);
    const fine = fbm2D(x * 0.03, 0.87, seed, 3);
    const height = biome.base + (roll - 0.5) * 2 * biome.amplitude + (fine - 0.5) * 2 * biome.detail;
    return Math.max(1, Math.round(height));
}

function isCave(x: number, y: number, seed: number): boolean {
    return fbm2D(x * CAVE_X_FREQ, y * CAVE_Y_FREQ, (seed ^ CAVE_SEED_MIX) >>> 0, CAVE_OCTAVES) > CAVE_THRESHOLD;
}

/** Ore type at a rock cell, or null. Deepslate cells use the deepslate ore variant when present. */
function oreAt(x: number, y: number, seed: number, isDeep: boolean): BlockType | null {
    for (const vein of ORE_VEINS) {
        if (y < vein.minY || y > vein.maxY) continue;
        const gx = Math.floor(x / vein.space);
        const gy = Math.floor(y / vein.space);
        if (hashNoise(gx * 7919 + gy * 104729 + vein.mix, seed) > vein.chance) continue;
        const jx = 0.2 + hashNoise(gx * 31 + gy * 17 + vein.mix, seed) * 0.6;
        const jy = 0.2 + hashNoise(gx * 13 + gy * 71 + vein.mix + 1, seed) * 0.6;
        const ax = gx * vein.space + jx * vein.space;
        const ay = gy * vein.space + jy * vein.space;
        const dx = x - ax;
        const dy = y - ay;
        if (dx * dx + dy * dy > vein.radius * vein.radius) continue;
        if (hashNoise(x * 7 + y * 13 + vein.mix, seed) > 0.82) continue;
        return isDeep && vein.deep ? vein.deep : vein.type;
    }
    return null;
}

/** Base rock at a cell: deepslate below the transition band, stone (with biome variant) above. */
function stoneOrDeepslate(x: number, y: number, seed: number): BlockType {
    const biome = biomeAt(x, seed);
    const variant = hashNoise(x * 131 + y * 2837, seed);
    const stone = variant < biome.variantChance ? biome.stoneVariant : biome.stone;
    if (y <= DEEPSLATE_TOP - DEEPSLATE_BAND) return DEEPSLATE;
    if (y > DEEPSLATE_TOP) return stone;
    const t = (y - (DEEPSLATE_TOP - DEEPSLATE_BAND)) / DEEPSLATE_BAND;
    return hashNoise(x * 53 + y * 149 + 7, seed) < 1 - t ? DEEPSLATE : stone;
}

function generatedBlock(x: number, y: number, surface: number, seed = 0): BlockType | null {
    if (y <= 0) return null;
    if (y <= BEDROCK_THICKNESS) return BEDROCK;
    const biome = biomeAt(x, seed);
    const depth = surface - y;
    if (depth === 0) return biome.surface;
    if (depth <= biome.surfaceDepth) return biome.surface;
    if (depth <= biome.surfaceDepth + biome.subDepth) return biome.subSurface;
    if (isCave(x, y, seed)) return null;
    const base = stoneOrDeepslate(x, y, seed);
    const ore = oreAt(x, y, seed, base === DEEPSLATE);
    return ore ?? base;
}

export interface WorldChunkDelta {
    idTable: string[];
    chunks: Record<string, string>;
}

export class World {
    readonly chunks = new Map<number, Chunk>();
    /** Chunks modified since the last save, keyed by "cx,0". */
    readonly dirty = new Set<string>();
    /** Latest block data for chunks that differ from generated terrain. */
    private readonly editedChunks = new Map<string, Uint16Array>();
    private readonly typeToNum = new Map<BlockType, number>();
    private readonly numToType = new Map<number, BlockType>();
    private centerChunk = 0;
    private loaded = false;

    constructor(private readonly viewDistance = 8, readonly seed = 0) {
        blockRegistry.list().forEach((definition, index) => {
            this.typeToNum.set(definition.id, index + 1);
            this.numToType.set(index + 1, definition.id);
        });
    }

    static cell(x: number, y: number): string {
        return `${x},${y}`;
    }

    static parseCell(cell: string): [number, number] {
        return cell.split(",").map(Number) as [number, number];
    }

    numFor(type: BlockType): number {
        return this.typeToNum.get(type) ?? 0;
    }

    typeFor(num: number): BlockType | null {
        return this.numToType.get(num) ?? null;
    }

    getChunk(x: number): Chunk | null {
        return this.chunks.get(Math.floor(x / CHUNK_SIZE)) ?? null;
    }

    updateView(cameraX: number): void {
        const center = Math.floor(cameraX / CHUNK_SIZE);
        if (center === this.centerChunk && this.loaded) return;
        this.centerChunk = center;
        this.loaded = true;
        for (let x = center - this.viewDistance; x <= center + this.viewDistance; x += 1) this.loadChunk(x);
        for (const x of this.chunks.keys()) {
            if (Math.abs(x - center) > this.viewDistance + 2) {
                const cell = World.cell(x, 0);
                const chunk = this.chunks.get(x);
                if (chunk && (this.dirty.has(cell) || this.editedChunks.has(cell))) this.editedChunks.set(cell, chunk.blocks.slice());
                this.chunks.delete(x);
            }
        }
    }

    getBlock(x: number, y: number): Block | null {
        const id = this.getBlockId(x, y);
        if (!id) return null;
        const definition = blockRegistry.get(id);
        return definition ? new Block(definition, x, y) : null;
    }

    getBlockId(x: number, y: number): BlockType | null {
        const chunk = this.chunks.get(Math.floor(x / CHUNK_SIZE));
        if (!chunk || y < 1 || y >= WORLD_HEIGHT) return null;
        const num = chunk.blockAt(x - chunk.start, y);
        return num ? this.typeFor(num) : null;
    }

    /** True when a solid block occupies the cell (non-solid plants are passable). */
    isSolid(x: number, y: number): boolean {
        const id = this.getBlockId(x, y);
        if (!id) return false;
        return blockRegistry.get(id)?.solid ?? true;
    }

    breakBlock(x: number, y: number): Block | null {
        const block = this.getBlock(x, y);
        if (!block) return null;
        const chunk = this.chunks.get(Math.floor(x / CHUNK_SIZE));
        if (!chunk) return null;
        chunk.setBlock(x - chunk.start, y, 0);
        this.markEdited(Math.floor(x / CHUNK_SIZE));
        return block;
    }

    placeBlock(x: number, y: number, type: BlockType | Block): boolean {
        if (y < 1 || y >= WORLD_HEIGHT || this.getBlock(x, y)) return false;
        const id = typeof type === "string" ? type : type.id;
        const num = this.typeToNum.get(id);
        if (!num) return false;
        const chunk = this.chunks.get(Math.floor(x / CHUNK_SIZE));
        if (!chunk) return false;
        chunk.setBlock(x - chunk.start, y, num);
        this.markEdited(Math.floor(x / CHUNK_SIZE));
        return true;
    }

    getSurfaceHeight(x: number): number {
        const chunk = this.chunks.get(Math.floor(x / CHUNK_SIZE));
        return chunk ? chunk.surfaces[x - chunk.start] : terrainHeight(x, this.seed);
    }

    serializeChanges(): WorldChunkDelta {
        const chunks: Record<string, string> = {};
        for (const cell of this.dirty) {
            const [cx] = World.parseCell(cell);
            const chunk = this.chunks.get(cx);
            if (chunk) chunks[cell] = chunk.encode();
        }
        return {idTable: blockRegistry.list().map((definition) => definition.id), chunks};
    }

    clearDirty(): void {
        this.dirty.clear();
    }

    restore(save: { idTable?: string[]; chunks?: Record<string, string> } | null): void {
        if (!save || !save.chunks) return;
        const savedTable = Array.isArray(save.idTable) ? save.idTable : [];
        for (const [cell, encoded] of Object.entries(save.chunks)) {
            const data = decodeChunk(encoded);
            if (!data) continue;
            for (let i = 0; i < data.length; i += 1) {
                const num = data[i];
                if (!num) continue;
                const type = savedTable[num - 1];
                data[i] = type ? this.typeToNum.get(type) ?? 0 : 0;
            }
            this.editedChunks.set(cell, data);
        }
        for (const [cell, data] of this.editedChunks) {
            const [cx] = World.parseCell(cell);
            const chunk = this.chunks.get(cx);
            if (chunk) chunk.blocks.set(data);
        }
    }

    private markEdited(cx: number): void {
        const cell = World.cell(cx, 0);
        const chunk = this.chunks.get(cx);
        if (!chunk) return;
        this.editedChunks.set(cell, chunk.blocks.slice());
        this.dirty.add(cell);
    }

    private loadChunk(x: number): void {
        if (this.chunks.has(x)) return;
        const chunk = new Chunk(x, (type) => this.typeToNum.get(type) ?? 0, this.seed);
        const edited = this.editedChunks.get(World.cell(x, 0));
        if (edited) chunk.blocks.set(edited);
        this.chunks.set(x, chunk);
    }
}
