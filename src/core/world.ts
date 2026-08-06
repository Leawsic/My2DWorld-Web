import type {BlockType} from "./types";
import {Blocks} from "./registry";
import {Block} from "./block";
import {blockRegistry} from "./registry";
import {fbm2D} from "./noise";

export const CHUNK_SIZE = 16;
const BEDROCK_THICKNESS = 2;
export const GRASS = Blocks.MY2DWORLD.GRASS_BLOCK_SIDE.id;
export const DIRT = Blocks.MY2DWORLD.DIRT.id;
export const STONE = Blocks.MY2DWORLD.STONE.id;
export const COBBLESTONE = Blocks.MY2DWORLD.COBBLESTONE.id;
export const MOSSY_COBBLESTONE = Blocks.MY2DWORLD.MOSSY_COBBLESTONE.id;
export const BEDROCK = Blocks.MY2DWORLD.BEDROCK.id;

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
}

const PLAINS: Biome = {
    id: "plains",
    base: 46,
    amplitude: 7,
    detail: 2.5,
    surface: GRASS,
    surfaceDepth: 1,
    subSurface: DIRT,
    subDepth: 4,
    stone: STONE,
    stoneVariant: COBBLESTONE,
    variantChance: 0.15,
};

const MOUNTAINS: Biome = {
    id: "mountains",
    base: 50,
    amplitude: 18,
    detail: 5,
    surface: GRASS,
    surfaceDepth: 1,
    subSurface: STONE,
    subDepth: 2,
    stone: STONE,
    stoneVariant: MOSSY_COBBLESTONE,
    variantChance: 0.3,
};

/** Low-frequency temperature/humidity field that drives biome selection. */
interface Climate {
    temp: number;
    hum: number;
}

const BIOME_TEMP_THRESHOLD = 0.5;
const BIOME_BLEND_WINDOW = 0.12;

function climate(x: number, seed: number): Climate {
    return {
        temp: fbm2D(x * 0.004, 0.37, seed ^ 0x9e37, 3),
        hum: fbm2D(x * 0.0032, 0.71, seed ^ 0x5bd1, 3),
    };
}

export function biomeAt(x: number, seed = 0): Biome {
    return climate(x, seed).temp < BIOME_TEMP_THRESHOLD ? MOUNTAINS : PLAINS;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class Chunk {
    readonly start: number;
    readonly blocks = new Map<string, Block>();
    readonly surfaces = new Map<number, number>();

    constructor(readonly x: number, readonly seed = 0) {
        this.start = x * CHUNK_SIZE;
        for (let worldX = this.start; worldX < this.start + CHUNK_SIZE; worldX += 1) {
            const surface = terrainHeight(worldX, seed);
            this.surfaces.set(worldX, surface);
            for (let y = 1; y <= surface; y += 1) {
                const type = generatedBlock(worldX, y, surface, seed);
                if (type) this.blocks.set(World.cell(worldX, y), new Block(blockRegistry.get(type)!, worldX, y));
            }
        }
    }

    getBlock(cell: string): Block | null {
        return this.blocks.get(cell) ?? null;
    }

    setBlock(block: Block): void {
        this.blocks.set(World.cell(block.x, block.y), block);
    }

    removeBlock(x: number, y: number): Block | null {
        const cell = World.cell(x, y);
        const block = this.blocks.get(cell) ?? null;
        this.blocks.delete(cell);
        return block;
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
    const {temp} = climate(x, seed);
    const blend = clamp01((BIOME_TEMP_THRESHOLD - temp) / BIOME_BLEND_WINDOW + 0.5);
    const base = lerp(PLAINS.base, MOUNTAINS.base, blend);
    const amplitude = lerp(PLAINS.amplitude, MOUNTAINS.amplitude, blend);
    const detail = lerp(PLAINS.detail, MOUNTAINS.detail, blend);
    const roll = fbm2D(x * 0.008, 0.21, seed, 4);
    const fine = fbm2D(x * 0.03, 0.87, seed, 3);
    const height = base + (roll - 0.5) * 2 * amplitude + (fine - 0.5) * 2 * detail;
    return Math.max(1, Math.round(height));
}

function generatedBlock(x: number, y: number, surface: number, seed = 0): BlockType | null {
    if (y <= 0) return null;
    if (y <= BEDROCK_THICKNESS) return BEDROCK;
    const biome = biomeAt(x, seed);
    const depth = surface - y;
    if (depth === 0) return biome.surface;
    if (depth <= biome.surfaceDepth) return biome.surface;
    if (depth <= biome.surfaceDepth + biome.subDepth) return biome.subSurface;
    const variant = hashNoise(x * 131 + y * 2837, seed);
    return variant < biome.variantChance ? biome.stoneVariant : biome.stone;
}

export class World {
    readonly chunks = new Map<number, Chunk>();
    readonly brokenBlocks = new Set<string>();
    readonly placedBlocks = new Map<string, Block>();
    private centerChunk: number | null = null;

    constructor(private readonly viewDistance = 8, readonly seed = 0) {
    }

    static cell(x: number, y: number): string {
        return `${x},${y}`;
    }

    static parseCell(cell: string): [number, number] {
        return cell.split(",").map(Number) as [number, number];
    }

    getChunk(x: number): Chunk | null {
        return this.chunks.get(Math.floor(x / CHUNK_SIZE)) ?? null;
    }

    updateView(cameraX: number): void {
        const center = Math.floor(cameraX / CHUNK_SIZE);
        if (center === this.centerChunk) return;
        this.centerChunk = center;
        for (let x = center - this.viewDistance; x <= center + this.viewDistance; x += 1) this.loadChunk(x);
        for (const x of this.chunks.keys()) if (Math.abs(x - center) > this.viewDistance + 2) this.chunks.delete(x);
    }

    getBlock(x: number, y: number): Block | null {
        const cell = World.cell(x, y);
        return this.placedBlocks.get(cell) ?? this.chunks.get(Math.floor(x / CHUNK_SIZE))?.blocks.get(cell) ?? null;
    }

    getBlockId(x: number, y: number): BlockType | null {
        return this.getBlock(x, y)?.id ?? null;
    }

    breakBlock(x: number, y: number): Block | null {
        const cell = World.cell(x, y);
        const type = this.placedBlocks.get(cell) ?? this.chunks.get(Math.floor(x / CHUNK_SIZE))?.blocks.get(cell) ?? null;
        if (!type) return null;
        this.placedBlocks.delete(cell);
        this.chunks.get(Math.floor(x / CHUNK_SIZE))?.removeBlock(x, y);
        this.brokenBlocks.add(cell);
        return type;
    }

    placeBlock(x: number, y: number, type: BlockType | Block): boolean {
        if (y < 1 || this.getBlock(x, y)) return false;
        const block = typeof type === "string" ? blockRegistry.get(type) : type.definition;
        if (!block) return false;
        this.placedBlocks.set(World.cell(x, y), new Block(block, x, y));
        this.brokenBlocks.delete(World.cell(x, y));
        return true;
    }

    getSurfaceHeight(x: number): number {
        return this.chunks.get(Math.floor(x / CHUNK_SIZE))?.surfaces.get(x) ?? terrainHeight(x, this.seed);
    }

    serializeChanges(): {
        brokenBlocks: [number, number][];
        placedBlocks: [number, number, BlockType][];
    } {
        return {
            brokenBlocks: [...this.brokenBlocks].map(World.parseCell),
            placedBlocks: [...this.placedBlocks].map(([cell, block]) => {
                const [x, y] = World.parseCell(cell);
                return [x, y, block.id];
            }),
        };
    }

    restore(brokenBlocks: [number, number][], placedBlocks: [number, number, BlockType][]): void {
        for (const [x, y] of brokenBlocks) this.brokenBlocks.add(World.cell(x, y));
        for (const [x, y, type] of placedBlocks) {
            const definition = blockRegistry.get(type);
            if (definition) this.placedBlocks.set(World.cell(x, y), new Block(definition, x, y));
        }
        for (const chunk of this.chunks.values()) this.applyChanges(chunk);
    }

    private loadChunk(x: number): void {
        if (this.chunks.has(x)) return;
        const chunk = new Chunk(x, this.seed);
        this.applyChanges(chunk);
        this.chunks.set(x, chunk);
    }

    private applyChanges(chunk: Chunk): void {
        for (const cell of this.brokenBlocks) {
            const [x] = World.parseCell(cell);
            if (x >= chunk.start && x < chunk.start + CHUNK_SIZE) chunk.blocks.delete(cell);
        }
    }
}
