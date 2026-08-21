// 生物「物理挤压」拆成两部分，与碰撞箱完全分开：
//   1) 挤压箱（几何）：public/squeeze/*.json，结构与碰撞箱一致（halfWidth/height/centerX/centerY、
//      boxes、left/right），决定「挤压重叠检测」用的盒体与阈值参考尺寸；缺省回退到
//      「碰撞箱外扩一圈」（SQUEEZE_INFLATE_*），绝不直接用碰撞箱几何。
//   2) 挤压参数（伤害/时长）：run/config/squeeze.json，全局一份，对任意生物（含玩家）生效。
// 数值字段都可省略，省略时回退到内置默认值。
import {hitboxCategoryOf, normalizeHitbox, type HitboxConfig, type NormalizedHitbox} from "./hitboxes";

/** 挤压伤害/时长参数（全局，对任意生物生效）。 */
export interface SqueezeParams {
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
}

/** 全局默认值（run/config/squeeze.json 缺失或字段省略时的回退）。 */
export const SQUEEZE_DEFAULTS = {
    baseDamage: 2,
    thresholdRatio: 0.4,
    iframe: 1,
    maxDamage: 10,
    difficulty: 1,
    playerDamageScale: 0.5,
} as const;

/** 未配置挤压箱时的回退（public/squeeze 下没有该 kind/分类文件时）：
 *  以该生物碰撞箱各方向外扩的量（方块）。约定与 public/squeeze 默认文件一致：
 *  挤压箱 = 碰撞箱 半宽 +0.1、高度 +0.1（中心不变）。挤压伤害严格按挤压箱结算，
 *  不会退化成按碰撞箱结算。 */
export const SQUEEZE_INFLATE_HALF_WIDTH = 0.1;
export const SQUEEZE_INFLATE_HEIGHT = 0.1;

/** 解析后的全局挤压参数：数值字段全部到位。 */
export interface ResolvedSqueeze {
    baseDamage: number;
    thresholdRatio: number;
    iframe: number;
    maxDamage: number;
    difficulty: number;
    playerDamageScale: number;
}

/** public/squeeze 下按分类/具体 kind 的挤压箱覆盖（结构与碰撞箱一致）。 */
const boxOverrides = new Map<string, NormalizedHitbox>();

/** 全局挤压参数（run/config/squeeze.json）。 */
let params: SqueezeParams = {};

let loaded = false;

function num(value: unknown, fallback: number): number {
    if (value === undefined || value === null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 解析后的全局挤压参数（缺失字段回退默认值）。 */
export function squeezeParams(): ResolvedSqueeze {
    return {
        baseDamage: num(params.baseDamage, SQUEEZE_DEFAULTS.baseDamage),
        thresholdRatio: num(params.thresholdRatio, SQUEEZE_DEFAULTS.thresholdRatio),
        iframe: num(params.iframe, SQUEEZE_DEFAULTS.iframe),
        maxDamage: num(params.maxDamage, SQUEEZE_DEFAULTS.maxDamage),
        difficulty: num(params.difficulty, SQUEEZE_DEFAULTS.difficulty),
        playerDamageScale: num(params.playerDamageScale, SQUEEZE_DEFAULTS.playerDamageScale),
    };
}

/** 该 kind 的挤压箱（结构与碰撞箱一致）；无配置时返回 null（回退到碰撞箱几何）。
 *  查找顺序：精确 kind → 所属分类（大/小×牛/猪/僵尸，复用碰撞箱的分类规则）。 */
export function squeezeBoxFor(kind: string): NormalizedHitbox | null {
    const category = hitboxCategoryOf(kind);
    return boxOverrides.get(kind) ?? boxOverrides.get(category) ?? null;
}

/** 挤压配置是否已从服务端加载完成（加载失败也算完成，回退默认值）。 */
export function isSqueezeLoaded(): boolean {
    return loaded;
}

/** 加载挤压箱几何（public/squeeze）与挤压参数（run/config/squeeze.json）。 */
export async function loadSqueeze(): Promise<void> {
    loaded = false;
    try {
        const [geometry, config] = await Promise.all([
            fetch("/api/squeeze").then((res) => (res.ok ? res.json() : null)).catch(() => null),
            fetch("/api/squeeze-config").then((res) => (res.ok ? res.json() : null)).catch(() => null),
        ]);
        boxOverrides.clear();
        const files = (geometry as {squeeze?: Record<string, HitboxConfig>} | null)?.squeeze;
        for (const [kind, hitbox] of Object.entries(files ?? {})) {
            const normalized = normalizeHitbox(hitbox);
            if (normalized) boxOverrides.set(kind, normalized);
        }
        params = config && typeof config === "object" ? (config as SqueezeParams) : {};
    } catch {
        // 配置加载失败：继续使用内置默认值
    } finally {
        loaded = true;
    }
}