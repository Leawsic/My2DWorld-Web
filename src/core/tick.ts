// 客户端 tick 速率（游戏速度）的纯计算：/tick rate 的换算与「一帧拆成几个模拟子步」。
//
// 约定：20 tick/秒 = 正常速度（1 倍速）。一帧需要模拟的秒数 = 真实帧时长 × (tickRate / 20)，
// 再拆成不超过一个正常 tick（1/20 秒）的子步 —— 这样任何倍速下单步物理都与正常速度一致，
// 只是每帧跑的步数不同（不会因为 10 倍速就让玩家一步穿过一格墙）。
//
// 本文件不依赖 DOM，可单独用 ts 探针验证。

/** 正常游戏速度：每秒 20 tick。 */
export const NORMAL_TICK_RATE = 20;
/** /tick rate 的合法范围（tick/秒）。 */
export const MIN_TICK_RATE = 1;
export const MAX_TICK_RATE = 200;
/** 单个模拟子步的最大时长（秒）= 正常速度下的一个 tick。 */
export const MAX_STEP_SECONDS = 1 / NORMAL_TICK_RATE;
/** 每帧默认最多模拟的子步数（防止极低帧率 + 极端速率时陷入死亡螺旋）。 */
export const DEFAULT_MAX_STEPS = 40;

/** tick 速率夹紧到合法范围（1..200 的整数）。 */
export function clampTickRate(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return NORMAL_TICK_RATE;
    return Math.max(MIN_TICK_RATE, Math.min(MAX_TICK_RATE, Math.round(n)));
}

/** 速率倍率：20 tick/秒 = 1 倍速。 */
export function tickScale(tickRate: number): number {
    return clampTickRate(tickRate) / NORMAL_TICK_RATE;
}

/** 一个 tick 的秒数（冻结单步推进用）。 */
export function tickSeconds(tickRate: number): number {
    return 1 / clampTickRate(tickRate);
}

/** n 个 tick 折算的秒数（/tick step 的耗时提示用）。 */
export function ticksToSeconds(ticks: number, tickRate: number): number {
    const count = Number.isFinite(ticks) ? Math.max(0, ticks) : 0;
    return count * tickSeconds(tickRate);
}

/**
 * 把一帧的真实时长拆成若干模拟子步，返回每个子步的时长（秒，可能为空数组）。
 *  - 总时长 = frameSeconds × tickScale(tickRate)（各自不超过 maxSteps × 1/20 秒）；
 *  - 每个子步 ≤ MAX_STEP_SECONDS；
 *  - 最多 maxSteps 个：极低帧率 + 极高速率时丢弃多余部分，避免越算越慢的死亡螺旋。
 */
export function simulationSteps(frameSeconds: number, tickRate: number, maxSteps = DEFAULT_MAX_STEPS): number[] {
    const seconds = Number.isFinite(frameSeconds) && frameSeconds > 0 ? frameSeconds : 0;
    let remaining = seconds * tickScale(tickRate);
    const limit = Math.max(1, Math.floor(maxSteps));
    const steps: number[] = [];
    // 1e-9：浮点减法会把整 tick 的余量留成 1e-17 级的尾数，用一个极小阈值收尾。
    while (remaining > 1e-9 && steps.length < limit) {
        const step = Math.min(MAX_STEP_SECONDS, remaining);
        steps.push(step);
        remaining -= step;
    }
    return steps;
}
