// 昼夜循环与环境光照的纯计算（不依赖 DOM，可单独验证）。
// 时间轴约定：0 点 = 午夜、0.25 = 日出、0.5 = 正午、0.75 = 日落（和原版一致的直觉）。

/** 一整个昼夜的现实时长（秒）：20 分钟。 */
export const DAY_LENGTH_SECONDS = 1200;
/** 关键时间点（当天时刻 0..1）。 */
export const SUNRISE_TIME = 0.25;
export const NOON_TIME = 0.5;
export const SUNSET_TIME = 0.75;
/** 午夜天空亮度下限（不是 0：夜里仍能看清轮廓）。 */
export const MIN_SKY_LIGHT = 0.18;
/** 地下最暗时的环境光（0.14 ≈ 压暗 86%：看得清形状，但明显是洞穴）。 */
export const MIN_CAVE_LIGHT = 0.14;
/** 地表以下多少格完全变暗（阴影过渡带高度）。 */
export const SHADOW_DEPTH = 6;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (k: number): number => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** 把秒数归一化到当天的 0..1 时刻。 */
export function timeOfDay(seconds: number): number {
    const t = (seconds / DAY_LENGTH_SECONDS) % 1;
    return t < 0 ? t + 1 : t;
}

/** 由小时数（0..24，可带小数，如 6.5 = 06:30）得到当天时刻。 */
export function timeFromHours(hours: number): number {
    return ((((hours % 24) + 24) % 24) / 24);
}

/** 天空亮度 0..1：正午 1、午夜 MIN_SKY_LIGHT，日出/日落各用 0.1 天平滑过渡。 */
export function skyLight(time: number): number {
    const t = timeOfDay(time);
    if (t <= 0.2 || t >= 0.8) return MIN_SKY_LIGHT;              // 深夜
    if (t >= 0.3 && t <= 0.7) return 1;                          // 白天
    if (t < 0.3) return lerp(MIN_SKY_LIGHT, 1, smoothstep((t - 0.2) / 0.1));  // 日出
    return lerp(1, MIN_SKY_LIGHT, smoothstep((t - 0.7) / 0.1));              // 日落
}

/** 日出/日落的暖色霞光强度 0..1（日出、日落时刻最强）。 */
export function horizonGlow(time: number): number {
    const t = timeOfDay(time);
    const dawn = 1 - Math.min(1, Math.abs(t - SUNRISE_TIME) / 0.1);
    const dusk = 1 - Math.min(1, Math.abs(t - SUNSET_TIME) / 0.1);
    return clamp01(Math.max(dawn, dusk));
}

/** 星星可见度 0..1（天空越暗越明显）。 */
export function starOpacity(time: number): number {
    return clamp01((0.42 - skyLight(time)) / 0.24);
}

/** 天空调色板：按当天时刻线性插值（正午保留原来的天蓝色 #82c9d7）。 */
const SKY_KEYS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
    [0, [10, 14, 34]],        // 午夜
    [0.2, [16, 22, 48]],
    [0.25, [232, 140, 92]],   // 日出
    [0.32, [130, 190, 216]],
    [0.5, [130, 201, 215]],   // 正午
    [0.68, [130, 190, 216]],
    [0.75, [224, 112, 74]],   // 日落
    [0.8, [22, 26, 54]],
    [1, [10, 14, 34]],
];

/** 指定时刻的天空颜色（rgb 字符串）。 */
export function skyColor(time: number): string {
    const t = timeOfDay(time);
    for (let i = 0; i < SKY_KEYS.length - 1; i += 1) {
        const [t0, c0] = SKY_KEYS[i];
        const [t1, c1] = SKY_KEYS[i + 1];
        if (t < t0 || t > t1) continue;
        const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        const r = Math.round(lerp(c0[0], c1[0], k));
        const g = Math.round(lerp(c0[1], c1[1], k));
        const b = Math.round(lerp(c0[2], c1[2], k));
        return `rgb(${r}, ${g}, ${b})`;
    }
    return "rgb(10, 14, 34)";
}

/** 天体在天空中的位置：x = 屏幕横向比例 0..1；y = 离地平线的高度比例 0..1（0 在地平线）。 */
export interface CelestialPosition {
    x: number;
    y: number;
}

export interface CelestialBodies {
    /** 白天的太阳（夜里为 null）。 */
    sun: CelestialPosition | null;
    /** 夜里的月亮（白天为 null）。 */
    moon: CelestialPosition | null;
}

/** 太阳/月亮的位置：各自在自己那半个昼夜里沿一条弧线升起、落下。 */
export function celestialBodies(time: number): CelestialBodies {
    const t = timeOfDay(time);
    const arc = (p: number): CelestialPosition => ({x: 0.08 + 0.84 * p, y: Math.sin(Math.PI * clamp01(p))});
    const sunUp = t >= SUNRISE_TIME && t <= SUNSET_TIME;
    const sun = sunUp ? arc((t - SUNRISE_TIME) / (SUNSET_TIME - SUNRISE_TIME)) : null;
    // 夜晚跨度 = 日落 → 次日日出（跨午夜）
    const nightSpan = 1 - SUNSET_TIME + SUNRISE_TIME;
    const nightProgress = t >= SUNSET_TIME ? (t - SUNSET_TIME) / nightSpan : (t + 1 - SUNSET_TIME) / nightSpan;
    const moon = sunUp ? null : arc(nightProgress);
    return {sun, moon};
}

/** 24 小时制时钟文本，例如 `06:30`。 */
export function clockLabel(time: number): string {
    const t = timeOfDay(time);
    const totalMinutes = Math.round(t * 24 * 60) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * 某格的环境光 0..1：地表及以上取当时的天空亮度；越往地下越暗，
 * 到 SHADOW_DEPTH 格以下固定为 MIN_CAVE_LIGHT（洞穴不会全黑，但明显变暗）。
 */
export function cellLight(sky: number, depthBelowSurface: number): number {
    const k = clamp01(depthBelowSurface / SHADOW_DEPTH);
    return Math.max(MIN_CAVE_LIGHT, clamp01(sky) * (1 - k));
}

/** 环境光对应的压暗透明度：0 = 不压暗。strength 是设置里的环境光照强度 0..1。 */
export function darknessAlpha(light: number, strength: number): number {
    return clamp01(1 - clamp01(light)) * clamp01(strength);
}

/**
 * 世界 y → 屏幕 y：格子 y 的**顶面**在屏幕上的 y（与方块渲染用的是同一个映射，
 * 见 main.ts 里 `(cameraY - y) * blockSize + height / 2`）。
 */
export function blockTopScreenY(cameraY: number, y: number, blockSize: number, height: number): number {
    return (cameraY - y) * blockSize + height / 2;
}

export interface AmbientBands {
    /** 过渡带顶（= 该列分界那一格的顶面在屏幕上的 y）。 */
    rampTop: number;
    /** 过渡带底：从这里往下是最暗的地下区域。 */
    rampBottom: number;
    /** 过渡带的像素高度。 */
    rampHeight: number;
}

/**
 * 某一列要画的两条压暗带的纵向范围（屏幕 y，未裁剪——Canvas 会自己裁掉画布外的部分）：
 * 分界以上是天空，不压暗；[rampTop, rampBottom] 是 SHADOW_DEPTH 格的渐变过渡带；
 * [rampBottom, height] 是最暗的地下区域。
 */
export function ambientBands(cameraY: number, top: number, blockSize: number, height: number): AmbientBands {
    const rampTop = blockTopScreenY(cameraY, top, blockSize, height);
    const rampHeight = Math.max(1, SHADOW_DEPTH * blockSize);
    return {rampTop, rampBottom: rampTop + rampHeight, rampHeight};
}

export interface Star {
    /** 屏幕横向比例 0..1。 */
    x: number;
    /** 天空区域纵向比例 0..1（越小越高）。 */
    y: number;
    /** 像素尺寸（1 或 2）。 */
    size: number;
    /** 闪烁相位。 */
    phase: number;
}

/** 固定的一小段哈希（0..1），保证星空每次生成都一样、不会跳。 */
function hash01(n: number): number {
    let h = Math.imul(n ^ 0x9e3779b9, 374761393) + 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) & 0x7fffffff) / 0x7fffffff;
}

/** 确定性星空：同一 count 永远得到同一片星空。 */
export function starField(count = 70): Star[] {
    const stars: Star[] = [];
    for (let i = 0; i < count; i += 1) {
        stars.push({
            x: hash01(i * 2 + 1),
            y: hash01(i * 2 + 2) * 0.6,
            size: hash01(i * 3 + 7) < 0.75 ? 1 : 2,
            phase: hash01(i * 5 + 11) * Math.PI * 2,
        });
    }
    return stars;
}
