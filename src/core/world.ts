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
