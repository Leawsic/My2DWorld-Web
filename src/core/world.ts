import type {BlockType} from "./types";

export const CHUNK_SIZE = 16;
const DIRT_DEPTH = 15;
const BEDROCK_THICKNESS = 2;
export const GRASS = "grass_block_side";
export const DIRT = "dirt";
export const STONE = "stone";
export const COBBLESTONE = "cobblestone";
export const MOSSY_COBBLESTONE = "mossy_cobblestone";
export const BEDROCK = "bedrock";

export function hashNoise(x: number): number {
    let h = Math.imul(x, 374761393) + 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x: number): number {
    const integer = Math.floor(x);
    let fraction = x - integer;
    fraction = fraction * fraction * (3 - 2 * fraction);
    return hashNoise(integer) + (hashNoise(integer + 1) - hashNoise(integer)) * fraction;
}

export function terrainHeight(x: number): number {
    const terrain = Math.sin(x * 0.008) * 12 + Math.sin(x * 0.025) * 6 + Math.sin(x * 0.06) * 2.5;
    return Math.max(1, Math.round(terrain + smoothNoise(x * 0.008) * 8 + smoothNoise(x * 0.03) * 3 + 45));
}

function generatedBlock(x: number, y: number, surface: number): BlockType | null {
    if (y <= 0) return null;
    if (y <= BEDROCK_THICKNESS) return BEDROCK;
    if (y === surface) return GRASS;
    const grassDepth = 2 + Math.floor(hashNoise(x + 9999) * 4);
    if (y > surface - grassDepth) return GRASS;
    if (y > surface - grassDepth - DIRT_DEPTH) return DIRT;
    const variant = hashNoise(x * 131 + y * 2837);
    return variant < 0.05 ? MOSSY_COBBLESTONE : variant < 0.15 ? COBBLESTONE : STONE;
}

class Chunk {
    readonly start: number;
    readonly blocks = new Map<string, BlockType>();
    readonly surfaces = new Map<number, number>();

    constructor(readonly x: number) {
        this.start = x * CHUNK_SIZE;
        for (let worldX = this.start; worldX < this.start + CHUNK_SIZE; worldX += 1) {
            const surface = terrainHeight(worldX);
            this.surfaces.set(worldX, surface);
            for (let y = 1; y <= surface; y += 1) {
                const type = generatedBlock(worldX, y, surface);
                if (type) this.blocks.set(World.cell(worldX, y), type);
            }
        }
    }
}

export class World {
    readonly chunks = new Map<number, Chunk>();
    readonly brokenBlocks = new Set<string>();
    readonly placedBlocks = new Map<string, BlockType>();
    private centerChunk: number | null = null;

    constructor(private readonly viewDistance = 8) {
    }

    static cell(x: number, y: number): string {
        return `${x},${y}`;
    }

    static parseCell(cell: string): [number, number] {
        return cell.split(",").map(Number) as [number, number];
    }

    updateView(cameraX: number): void {
        const center = Math.floor(cameraX / CHUNK_SIZE);
        if (center === this.centerChunk) return;
        this.centerChunk = center;
        for (let x = center - this.viewDistance; x <= center + this.viewDistance; x += 1) this.loadChunk(x);
        for (const x of this.chunks.keys()) if (Math.abs(x - center) > this.viewDistance + 2) this.chunks.delete(x);
    }

    getBlock(x: number, y: number): BlockType | null {
        const cell = World.cell(x, y);
        return this.placedBlocks.get(cell) ?? this.chunks.get(Math.floor(x / CHUNK_SIZE))?.blocks.get(cell) ?? null;
    }

    breakBlock(x: number, y: number): BlockType | null {
        const cell = World.cell(x, y);
        const type = this.placedBlocks.get(cell) ?? this.chunks.get(Math.floor(x / CHUNK_SIZE))?.blocks.get(cell) ?? null;
        if (!type) return null;
        this.placedBlocks.delete(cell);
        this.chunks.get(Math.floor(x / CHUNK_SIZE))?.blocks.delete(cell);
        this.brokenBlocks.add(cell);
        return type;
    }

    placeBlock(x: number, y: number, type: BlockType): boolean {
        if (y < 1 || this.getBlock(x, y)) return false;
        this.placedBlocks.set(World.cell(x, y), type);
        this.brokenBlocks.delete(World.cell(x, y));
        return true;
    }

    getSurfaceHeight(x: number): number {
        return this.chunks.get(Math.floor(x / CHUNK_SIZE))?.surfaces.get(x) ?? terrainHeight(x);
    }

    restore(brokenBlocks: [number, number][], placedBlocks: [number, number, BlockType][]): void {
        for (const [x, y] of brokenBlocks) this.brokenBlocks.add(World.cell(x, y));
        for (const [x, y, type] of placedBlocks) this.placedBlocks.set(World.cell(x, y), type);
        for (const chunk of this.chunks.values()) this.applyChanges(chunk);
    }

    private loadChunk(x: number): void {
        if (this.chunks.has(x)) return;
        const chunk = new Chunk(x);
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
