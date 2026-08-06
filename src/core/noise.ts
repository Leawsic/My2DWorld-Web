/** Seeded procedural noise primitives used by world generation. */

/** Deterministic 32-bit PRNG derived from a seed. */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
}

function hash2(x: number, y: number, seed: number): number {
    let h = (seed >>> 0) ^ Math.imul(x, 0x165667b1) ^ Math.imul(y, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h ^ (h >>> 7), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 0xffffffff;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** 2D value noise in [0, 1], deterministic per seed. */
export function valueNoise2D(x: number, y: number, seed = 0): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = hash2(xi, yi, seed);
    const b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed);
    const d = hash2(xi + 1, yi + 1, seed);
    const u = fade(xf);
    const v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal (multi-octave) value noise normalized to roughly [0, 1]. */
export function fbm2D(x: number, y: number, seed = 0, octaves = 4, persistence = 0.5, lacunarity = 2): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let max = 0;
    for (let i = 0; i < octaves; i += 1) {
        total += valueNoise2D(x * frequency, y * frequency, (seed + i * 0x9e3779b9) >>> 0) * amplitude;
        max += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return total / max;
}
