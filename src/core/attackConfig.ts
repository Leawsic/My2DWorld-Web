// 玩家与生物的攻击力配置（public/entitiesattack.json，经 /api/entitiesattack 加载）。
// 字段都可省略，省略时回退到内置默认值；生物伤害支持按 kind 精确覆盖，
// 未覆盖的 kind 用内置默认（MOB_KINDS[kind].damage）乘以 mobDamageScale 缩放。

export interface AttackConfig {
    /** 玩家每次攻击造成的伤害。默认 2。 */
    playerDamage?: number;
    /** 玩家攻击冷却（帧，60fps 计）。默认 8。 */
    playerAttackCooldownFrames?: number;
    /** 未单独配置伤害的生物使用的缩放系数。默认 0.5。 */
    mobDamageScale?: number;
    /** 按生物 kind 精确覆盖的伤害。 */
    mobs?: Record<string, number>;
}

/** 内置默认值（entitiesattack.json 缺失或字段省略时的回退）。 */
export const ATTACK_DEFAULTS = {
    playerDamage: 2,
    playerAttackCooldownFrames: 8,
    mobDamageScale: 0.5,
} as const;

let config: AttackConfig = {};
let loaded = false;

function num(value: unknown, fallback: number, min = 0): number {
    if (value === undefined || value === null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= min ? n : fallback;
}

/** 玩家每次攻击造成的伤害。 */
export function playerAttackDamage(): number {
    return num(config.playerDamage, ATTACK_DEFAULTS.playerDamage);
}

/** 玩家攻击冷却（帧）。 */
export function playerAttackCooldownFrames(): number {
    return num(config.playerAttackCooldownFrames, ATTACK_DEFAULTS.playerAttackCooldownFrames, 1);
}

/** 某生物的每次攻击伤害：优先按 kind 覆盖，否则用内置默认值 × mobDamageScale。 */
export function mobAttackDamage(kind: string, fallback: number): number {
    const override = config.mobs?.[kind];
    if (override !== undefined && Number.isFinite(Number(override))) return num(override, fallback);
    return num(fallback * num(config.mobDamageScale, ATTACK_DEFAULTS.mobDamageScale), fallback);
}

/** 攻击配置是否已从服务端加载完成（加载失败也算完成，回退默认值）。 */
export function isAttackConfigLoaded(): boolean {
    return loaded;
}

/** 从 /api/entitiesattack（public/entitiesattack.json）加载攻击配置。 */
export async function loadAttackConfig(): Promise<void> {
    loaded = false;
    try {
        const res = await fetch("/api/entitiesattack");
        const data = res.ok ? ((await res.json()) as AttackConfig) : null;
        config = data && typeof data === "object" ? data : {};
    } catch {
        // 配置加载失败：继续使用内置默认值
    } finally {
        loaded = true;
    }
}