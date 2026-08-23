import type {BlockType} from "./types";
import {Blocks} from "./registry";
import {Block} from "./block";
import type {BlockNbt} from "./block";
import {blockRegistry} from "./registry";
import {fbm2D} from "./noise";
import {applyFeatures} from "./features";
import {applyStructures} from "./structures";

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

/** Rock type below this depth becomes deepslate (aligned with 1.18: stone above y=0, deepslate below). */
const DEEPSLATE_TOP = 0;
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
    {type: Blocks.MY2DWORLD.COAL_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_COAL_ORE.id, minY: 8, maxY: 160, space: 16, chance: 0.45, radius: 1.9, mix: 0x111},
    {type: Blocks.MY2DWORLD.IRON_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_IRON_ORE.id, minY: -16, maxY: 128, space: 18, chance: 0.33, radius: 1.8, mix: 0x222},
    {type: Blocks.MY2DWORLD.COPPER_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_COPPER_ORE.id, minY: -32, maxY: 96, space: 18, chance: 0.3, radius: 1.7, mix: 0x333},
    {type: Blocks.MY2DWORLD.GOLD_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_GOLD_ORE.id, minY: -64, maxY: 48, space: 22, chance: 0.25, radius: 1.6, mix: 0x444},
    {type: Blocks.MY2DWORLD.REDSTONE_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_REDSTONE_ORE.id, minY: -64, maxY: 32, space: 22, chance: 0.28, radius: 1.5, mix: 0x555},
    {type: Blocks.MY2DWORLD.LAPIS_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_LAPIS_ORE.id, minY: -64, maxY: 48, space: 24, chance: 0.26, radius: 1.6, mix: 0x666},
    {type: Blocks.MY2DWORLD.DIAMOND_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_DIAMOND_ORE.id, minY: -64, maxY: 24, space: 26, chance: 0.22, radius: 1.5, mix: 0x777},
    {type: Blocks.MY2DWORLD.EMERALD_ORE.id, deep: Blocks.MY2DWORLD.DEEPSLATE_EMERALD_ORE.id, minY: -32, maxY: 16, space: 28, chance: 0.2, radius: 1.4, mix: 0x888},
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
    id: "plains", base: 68, amplitude: 7, detail: 3,
    surface: GRASS, surfaceDepth: 1, subSurface: DIRT, subDepth: 4,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.15,
    grass: "#82c34d", foliage: "#5a9424",
};

/** Neutral tint used for inventory/hotbar icons before a real column is known. */
export const DEFAULT_BIOME: Biome = PLAINS;

const FOREST: Biome = {
    id: "forest", base: 66, amplitude: 7, detail: 3,
    surface: GRASS, surfaceDepth: 1, subSurface: DIRT, subDepth: 4,
    stone: STONE, stoneVariant: MOSSY_COBBLESTONE, variantChance: 0.2,
    grass: "#5d9e33", foliage: "#3d8a1f",
};

const DESERT: Biome = {
    id: "desert", base: 68, amplitude: 6, detail: 3.5,
    surface: SAND, surfaceDepth: 3, subSurface: SAND, subDepth: 4,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.12,
    grass: "#c7b56f", foliage: "#8a9a4f",
};

const SNOWY: Biome = {
    id: "snowy", base: 88, amplitude: 9, detail: 4,
    surface: SNOW, surfaceDepth: 1, subSurface: GRASS, subDepth: 2,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.1,
    grass: "#9db98a", foliage: "#8aab77",
};

const MOUNTAINS: Biome = {
    id: "mountains", base: 132, amplitude: 55, detail: 10,
    surface: GRASS, surfaceDepth: 1, subSurface: STONE, subDepth: 2,
    stone: STONE, stoneVariant: MOSSY_COBBLESTONE, variantChance: 0.3,
    grass: "#6daa3c", foliage: "#4f8324",
};

/** Snow caps mountain peaks above this elevation. */
const SNOW_LINE = 148;

/** 海洋：大型群系，可延伸 5000+ 格。无水的干涸海床——低而平坦的沙地。 */
const OCEAN: Biome = {
    id: "ocean", base: 50, amplitude: 2, detail: 1,
    surface: SAND, surfaceDepth: 3, subSurface: SAND, subDepth: 6,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.1,
    grass: "#82c34d", foliage: "#5a9424",
};

/** 河流：小型群系，跨度约 50-100 格，略低于周围地形的沙质河床。 */
const RIVER: Biome = {
    id: "river", base: 60, amplitude: 2, detail: 1.5,
    surface: SAND, surfaceDepth: 2, subSurface: DIRT, subDepth: 4,
    stone: STONE, stoneVariant: COBBLESTONE, variantChance: 0.1,
    grass: "#82c34d", foliage: "#5a9424",
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

/** 大陆/海洋尺度：基频波长约 3300 格，海洋区域可延伸 5000+ 格。 */
const OCEAN_FREQ = 0.0003;
const OCEAN_SEED = 0x0ce4;
const OCEAN_THRESHOLD = 0.45;
/** 河流尺度：约 50-100 格宽的窄带（abs(noise-0.5) < band）。 */
const RIVER_FREQ = 0.008;
const RIVER_SEED = 0x11e9;
const RIVER_BAND = 0.09;

function climate(x: number, seed: number): Climate {
    return {
        temp: fbm2D(x * 0.0016, 0.37, seed ^ 0x9e37, 3),
        hum: fbm2D(x * 0.0012, 0.71, seed ^ 0x5bd1, 3),
    };
}

/** 多尺度群系选择：海洋（5000+ 格）→ 河流（50-100 格窄带）→ 气候带（数百至上千格）。 */
export function biomeAt(x: number, seed = 0): Biome {
    if (fbm2D(x * OCEAN_FREQ, 0.9, (seed ^ OCEAN_SEED) >>> 0, 2) < OCEAN_THRESHOLD) return OCEAN;
    const river = fbm2D(x * RIVER_FREQ, 0.3, (seed ^ RIVER_SEED) >>> 0, 2);
    if (Math.abs(river - 0.5) < RIVER_BAND) return RIVER;
    const {temp, hum} = climate(x, seed);
    if (fbm2D(x * RUGGED_FREQ, 0.5, seed ^ RUGGED_SEED, 3) > RUGGED_THRESHOLD) return MOUNTAINS;
    if (temp < SNOWY_TEMP) return SNOWY;
    if (temp > DESERT_TEMP) return DESERT;
    return hum < HUMIDITY_SPLIT ? PLAINS : FOREST;
}

/** Bottom of the world: the bedrock floor sits at Y=-64. */
export const WORLD_MIN_Y = -64;
/** Highest placeable block row (build limit is 320, so the top block is Y=319). */
export const WORLD_MAX_Y = 319;
/** Total block rows, indexed as `y - WORLD_MIN_Y`. */
export const WORLD_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y + 1;

/** Converts a world y to a column offset (for `localX * WORLD_HEIGHT + col`). */
function columnOf(y: number): number {
    return y - WORLD_MIN_Y;
}

export class Chunk {
    readonly start: number;
    /** Column-major numeric block ids: index = localX * WORLD_HEIGHT + (y - WORLD_MIN_Y); air = 0. */
    readonly blocks = new Uint16Array(CHUNK_SIZE * WORLD_HEIGHT);
    readonly surfaces = new Int16Array(CHUNK_SIZE);

    constructor(readonly x: number, readonly numFor: (type: BlockType) => number, readonly seed: number) {
        this.start = x * CHUNK_SIZE;
        for (let local = 0; local < CHUNK_SIZE; local += 1) {
            const worldX = this.start + local;
            const surface = terrainHeight(worldX, seed);
            this.surfaces[local] = surface;
            const column = local * WORLD_HEIGHT;
            for (let y = WORLD_MIN_Y; y <= surface; y += 1) {
                const type = generatedBlock(worldX, y, surface, seed);
                if (type) this.blocks[column + columnOf(y)] = numFor(type);
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
        applyStructures({
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
        return this.blocks[localX * WORLD_HEIGHT + columnOf(y)];
    }

    setBlock(localX: number, y: number, num: number): void {
        this.blocks[localX * WORLD_HEIGHT + columnOf(y)] = num;
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

/** Half-width (in columns) of the triangular height-blend window across biome transitions.
 * 加宽后海洋与陆地之间是缓坡海岸，不会出现悬崖式断层。 */
const TRANSITION_BAND = 6;

export function terrainHeight(x: number, seed = 0): number {
    // Blend the per-biome heights across a short window so elevation changes
    // gradually at biome borders instead of dropping in a single cliff step.
    let sum = 0;
    let weightSum = 0;
    for (let k = -TRANSITION_BAND; k <= TRANSITION_BAND; k += 1) {
        const sx = x + k;
        const biome = biomeAt(sx, seed);
        const roll = fbm2D(sx * 0.008, 0.21, seed, 4);
        const fine = fbm2D(sx * 0.03, 0.87, seed, 3);
        const height = biome.base + (roll - 0.5) * 2 * biome.amplitude + (fine - 0.5) * 2 * biome.detail;
        sum += height * (TRANSITION_BAND + 1 - Math.abs(k));
        weightSum += TRANSITION_BAND + 1 - Math.abs(k);
    }
    return Math.max(1, Math.round(sum / weightSum));
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
    if (y <= WORLD_MIN_Y + BEDROCK_THICKNESS) return BEDROCK;
    const biome = biomeAt(x, seed);
    const depth = surface - y;
    const snowyCap = biome.id === "mountains" && y >= SNOW_LINE;
    if (depth === 0) return snowyCap ? SNOW : biome.surface;
    if (depth <= biome.surfaceDepth) return snowyCap ? SNOW : biome.surface;
    if (depth <= biome.surfaceDepth + biome.subDepth) return snowyCap ? SNOW : biome.subSurface;
    if (isCave(x, y, seed)) return null;
    const base = stoneOrDeepslate(x, y, seed);
    const ore = oreAt(x, y, seed, base === DEEPSLATE);
    return ore ?? base;
}

export interface WorldChunkDelta {
    idTable: string[];
    chunks: Record<string, string>;
    /** 每格方块的覆盖 NBT（cell "x,y" -> JSON 字符串），仅保存非默认的 NBT。 */
    nbt: Record<string, string>;
}

export class World {
    readonly chunks = new Map<number, Chunk>();
    /** Chunks modified since the last save, keyed by "cx,0". */
    readonly dirty = new Set<string>();
    /** Latest block data for chunks that differ from generated terrain. */
    private readonly editedChunks = new Map<string, Uint16Array>();
    /** 覆盖 NBT（仅在不同于方块定义默认值时记录），key 为 cell "x,y"。 */
    private readonly blockNbt = new Map<string, BlockNbt>();
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
        return definition ? new Block(definition, x, y, this.nbtAt(x, y)) : null;
    }

    getBlockId(x: number, y: number): BlockType | null {
        const chunk = this.chunks.get(Math.floor(x / CHUNK_SIZE));
        if (!chunk || y < WORLD_MIN_Y || y > WORLD_MAX_Y) return null;
        const num = chunk.blockAt(x - chunk.start, y);
        return num ? this.typeFor(num) : null;
    }

    /** 该格方块的有效 NBT：方块定义默认值 + 覆盖值。 */
    nbtAt(x: number, y: number): BlockNbt {
        const id = this.getBlockId(x, y);
        const definition = id ? blockRegistry.get(id) : undefined;
        return {...(definition?.nbt ?? {}), ...(this.blockNbt.get(World.cell(x, y)) ?? {})};
    }

    /** 该格方块的有效层级（1/2/3），缺省为 1。 */
    layerAt(x: number, y: number): number {
        return this.nbtAt(x, y).layer ?? 1;
    }

    /**
     * True when a solid block that blocks the path occupies the cell.
     * 三层系统：只有第 1 层（最上面）会挡路；第 2 层（树叶）与第 3 层（木头）不挡路。
     */
    isSolid(x: number, y: number): boolean {
        const id = this.getBlockId(x, y);
        if (!id) return false;
        const definition = blockRegistry.get(id);
        if (!definition) return false;
        if (this.layerAt(x, y) !== 1) return false;
        return definition.solid ?? true;
    }

    /** 玩家放置的方块是否在下方有实心支撑（用于花/草等地物不能悬空）。 */
    hasSupport(x: number, y: number): boolean {
        return this.isSolid(x, y - 1);
    }

    breakBlock(x: number, y: number): Block | null {
        const block = this.getBlock(x, y);
        if (!block) return null;
        const chunk = this.chunks.get(Math.floor(x / CHUNK_SIZE));
        if (!chunk) return null;
        chunk.setBlock(x - chunk.start, y, 0);
        this.blockNbt.delete(World.cell(x, y));
        this.markEdited(Math.floor(x / CHUNK_SIZE));
        return block;
    }

    placeBlock(x: number, y: number, type: BlockType | Block): boolean {
        if (y < WORLD_MIN_Y || y > WORLD_MAX_Y || this.getBlock(x, y)) return false;
        const id = typeof type === "string" ? type : type.id;
        const definition = blockRegistry.get(id);
        if (!definition) return false;
        // 地物（花/草等）不能在空中放置：必须有实心支撑块在正下方。
        if (definition.feature && !this.hasSupport(x, y)) return false;
        // 玩家只能把方块放在第 1 层：强制覆盖层级为 1（树叶/木头定义默认在 2/3 层）。
        const block = typeof type === "string" ? new Block(definition, 0, 0, {layer: 1}) : new Block(type.definition, type.x, type.y, {...type.nbt, layer: 1});
        return this.setBlock(x, y, block);
    }

    /** Places or replaces a block in any loaded chunk (used by structure loading). */
    setBlock(x: number, y: number, type: BlockType | Block): boolean {
        if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return false;
        const id = typeof type === "string" ? type : type.id;
        const num = this.typeToNum.get(id);
        if (!num) return false;
        const chunk = this.chunks.get(Math.floor(x / CHUNK_SIZE));
        if (!chunk) return false;
        chunk.setBlock(x - chunk.start, y, num);
        this.applyNbt(x, y, id, typeof type === "string" ? undefined : type.nbt);
        this.markEdited(Math.floor(x / CHUNK_SIZE));
        return true;
    }

    /** 保留与方块定义默认值不同的覆盖 NBT（默认值不落盘，保持存档轻量）。 */
    private applyNbt(x: number, y: number, id: BlockType, nbt?: BlockNbt): void {
        const definition = blockRegistry.get(id);
        const defaults = definition?.nbt ?? {};
        let override: BlockNbt = {};
        const merged = {...defaults, ...(nbt ?? {})};
        for (const [key, value] of Object.entries(merged)) {
            // layer 缺省为 1；与缺省一致的层级无需落盘。
            const effectiveDefault = key === "layer" ? (defaults[key] ?? 1) : defaults[key];
            if (effectiveDefault !== value) override[key] = value;
        }
        if (Object.keys(override).length) this.blockNbt.set(World.cell(x, y), override);
        else this.blockNbt.delete(World.cell(x, y));
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
        const nbt: Record<string, string> = {};
        for (const [cell, data] of this.blockNbt) nbt[cell] = JSON.stringify(data);
        return {idTable: blockRegistry.list().map((definition) => definition.id), chunks, nbt};
    }

    clearDirty(): void {
        this.dirty.clear();
    }

    restore(save: { idTable?: string[]; chunks?: Record<string, string>; nbt?: Record<string, string> } | null): void {
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
        if (save.nbt) {
            for (const [cell, encoded] of Object.entries(save.nbt)) {
                try {
                    this.blockNbt.set(cell, JSON.parse(encoded) as BlockNbt);
                } catch {
                    // 忽略损坏的 NBT 条目
                }
            }
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
