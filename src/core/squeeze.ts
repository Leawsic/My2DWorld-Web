// 生物「物理挤压伤害」配置：从 /api/squeeze（public/squeeze 下的 JSON 文件）加载。
// 与碰撞箱（public/hitboxes）完全分开配置——碰撞箱只决定几何（能否重叠、推开偏移），
// 挤压伤害只由这里的参数决定（基础伤害、阈值比例、无敌帧、单次上限、难度等）。
//
// 文件按「分类」命名，与碰撞箱共用同一套分类（cow/pig/zombie 及 _baby），另有
// default.json 作为全局回退（玩家作为受害方时也使用 default）。
// 每个字段都可省略，省略的字段回退到默认值；bodyWidth/bodyHeight 省略时回退到该生物
// 当前碰撞箱尺寸（保持「挤压是否触发」与碰撞箱几何自动匹配）。
import {hitboxCategoryOf} from "./hitboxes";

export interface SqueezeConfig {
    /** 基础伤害：重叠达到阈值后按重叠比例放大。默认 2。 */
    baseDamage?: number;
    /** 阈值比例：重叠深度超过该生物对应方向尺寸的该比例才结算伤害。默认 0.4。 */
    thresholdRatio?: number;
    /** 挤压无敌帧（秒），期间不再受挤压伤害（击退仍生效）。默认 1。 */
    iframe?: number;
    /** 单次结算上限：多实体挤压线性叠加但不超此值。默认 10。 */
    maxDamage?: number;
    /** 难度系数。默认 1。 */
    difficulty?: number;
    /** 玩家挤压怪物时的伤害缩放（主要效果是推开）。默认 0.5。 */
    playerDamageScale?: number;
    /** 阈值参考的「身体宽度」；缺省用碰撞箱宽度（halfWidth×2）。 */
    bodyWidth?: number;
    /** 阈值参考的「身体高度」；缺省用碰撞箱高度。 */
    bodyHeight?: number;
}

/** 全局默认值（未配置时的回退）。 */
export const SQUEEZE_DEFAULTS = {
    baseDamage: 2,
    thresholdRatio: 0.4,
    iframe: 1,
    maxDamage: 10,
    difficulty: 1,
    playerDamageScale: 0.5,
} as const;

/** 解析后的完整配置：数值字段全部到位；bodyWidth/bodyHeight 缺省表示回退到碰撞箱尺寸。 */
export interface ResolvedSqueeze {
    baseDamage: number;
    thresholdRatio: number;
    iframe: number;
    maxDamage: number;
    difficulty: number;
    playerDamageScale: number;
    bodyWidth?: number;
    bodyHeight?: number;
}

/** 服务端文件（public/squeeze/*.json）加载的覆盖配置。 */
const overrides = new Map<string, SqueezeConfig>();

let loaded = false;

function num(value: unknown, fallback: number): number {
    if (value === undefined || value === null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function optionalNum(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** 合并 default → 分类 → 具体 kind，并解析为完整数值配置。 */
export function squeezeFor(kind: string): ResolvedSqueeze {
    const category = hitboxCategoryOf(kind);
    const merged: SqueezeConfig = {
        ...overrides.get("default"),
        ...overrides.get(category),
        ...overrides.get(kind),
    };
    return {
        baseDamage: num(merged.baseDamage, SQUEEZE_DEFAULTS.baseDamage),
        thresholdRatio: num(merged.thresholdRatio, SQUEEZE_DEFAULTS.thresholdRatio),
        iframe: num(merged.iframe, SQUEEZE_DEFAULTS.iframe),
        maxDamage: num(merged.maxDamage, SQUEEZE_DEFAULTS.maxDamage),
        difficulty: num(merged.difficulty, SQUEEZE_DEFAULTS.difficulty),
        playerDamageScale: num(merged.playerDamageScale, SQUEEZE_DEFAULTS.playerDamageScale),
        bodyWidth: optionalNum(merged.bodyWidth),
        bodyHeight: optionalNum(merged.bodyHeight),
    };
}

/** 挤压配置是否已从服务端加载完成（加载失败也算完成，回退默认值）。 */
export function isSqueezeLoaded(): boolean {
    return loaded;
}

/** 从服务端加载 public/squeeze 目录下的挤压配置。 */
export async function loadSqueeze(): Promise<void> {
    loaded = false;
    try {
        const res = await fetch("/api/squeeze");
        if (res.ok) {
            const data = (await res.json()) as {squeeze?: Record<string, SqueezeConfig>};
            overrides.clear();
            for (const [kind, config] of Object.entries(data.squeeze ?? {})) {
                if (config && typeof config === "object") overrides.set(kind, config);
            }
        }
    } catch {
        // 配置加载失败：继续使用内置默认值
    } finally {
        loaded = true;
    }
}