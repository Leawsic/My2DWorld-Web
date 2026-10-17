/**
 * 手持物品的「.myanim 节点几何覆盖」配置（`public/items/hold.json`，经 `/api/hold`）。
 *
 * 玩家角色动画（`public/animations/player/*.myanim`）里，左右手物品是 `itemL` / `itemR` 两个
 * image 对象，模板里写的是 `"w": 0.4, "h": 0.4, "pivot": [0.5, 0.5]`（小图标、绕中心旋转）。
 * 拿着**工具**（物品定义里带 `tool` 字段：镐/斧/剑/锹/锄）时，贴图明显太小、旋转中心也不在握把上，
 * 于是这里把这两个节点的几何在渲染时覆盖成配置里的值（默认 `w: 2, h: 2, pivot: [0, 1]`：
 * 放大到 2 个方块、绕左下角（握把底部）旋转），**不改动 .myanim 文件本身**。
 *
 * 手拿方块等非工具物品时不做覆盖，仍用模板原值；所以同一份动画文件能同时满足两种手感。
 * 单位与 .myanim 一致：player 模板下 1 单位 = 1 个方块。
 */

/** 单个节点的几何覆盖。 */
export interface HoldNodeGeometry {
    /** 宽度（与 .myanim 里的 w 同单位，player 模板下 1 单位 = 1 方块）。 */
    w: number;
    /** 高度。 */
    h: number;
    /** 旋转中心（比例 0..1，`[0, 1]` = 图片左下角）。 */
    pivot: [number, number];
}

export interface HoldStyleConfig {
    /** 需要覆盖的对象 id（默认 `itemL` / `itemR`）。 */
    nodes: string[];
    /** 手持「工具」时的几何。 */
    tool: HoldNodeGeometry;
}

/** 内置默认值，与 `public/items/hold.json` 完全一致（配置文件读不到时用它）。 */
export const DEFAULT_HOLD_STYLE: HoldStyleConfig = {
    nodes: ["itemL", "itemR"],
    tool: {w: 2, h: 2, pivot: [0, 1]},
};

let current: HoldStyleConfig = DEFAULT_HOLD_STYLE;
let revision = 0;

/** 当前生效的配置（渲染每帧读取；不要就地修改返回值）。 */
export function holdStyle(): HoldStyleConfig {
    return current;
}

/** 配置版本号：每次 `setHoldStyle` 自增，渲染层据此丢弃旧的节点几何变体缓存。 */
export function holdStyleRevision(): number {
    return revision;
}

export function setHoldStyle(config: HoldStyleConfig): void {
    current = config;
    revision += 1;
}

/**
 * 某个动画对象在该掩码下要不要换成工具几何（纯函数，渲染与探针共用）。
 * `mask`：bit0 = 左手（itemL）拿工具，bit1 = 右手（itemR）拿工具。
 * 返回 null 表示保持 .myanim 里的原值（不拿工具 / 该 id 不在配置的节点列表里 / 这只手拿的不是工具）。
 */
export function holdGeometryFor(objectId: string, mask: number, config: HoldStyleConfig = current): HoldNodeGeometry | null {
    if (!mask || !config.nodes.includes(objectId)) return null;
    const isTool = objectId === "itemL" ? (mask & 1) !== 0 : objectId === "itemR" ? (mask & 2) !== 0 : false;
    return isTool ? config.tool : null;
}

function finiteNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/** 容错解析：缺字段/类型不对时逐项回落到默认值，绝不抛错（配置文件在 runtime 目录里可手改）。 */
export function parseHoldStyle(raw: unknown): HoldStyleConfig {
    const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const nodesRaw = source.nodes;
    const nodes = Array.isArray(nodesRaw)
        ? nodesRaw.filter((node): node is string => typeof node === "string" && node.length > 0)
        : [];
    const geometryRaw = source.tool && typeof source.tool === "object" ? (source.tool as Record<string, unknown>) : {};
    const w = finiteNumber(geometryRaw.w);
    const h = finiteNumber(geometryRaw.h);
    const pivotRaw = geometryRaw.pivot;
    const pivotX = Array.isArray(pivotRaw) ? finiteNumber(pivotRaw[0]) : null;
    const pivotY = Array.isArray(pivotRaw) ? finiteNumber(pivotRaw[1]) : null;
    return {
        nodes: nodes.length ? nodes : [...DEFAULT_HOLD_STYLE.nodes],
        tool: {
            w: w !== null && w > 0 ? w : DEFAULT_HOLD_STYLE.tool.w,
            h: h !== null && h > 0 ? h : DEFAULT_HOLD_STYLE.tool.h,
            pivot: [
                pivotX !== null ? pivotX : DEFAULT_HOLD_STYLE.tool.pivot[0],
                pivotY !== null ? pivotY : DEFAULT_HOLD_STYLE.tool.pivot[1],
            ],
        },
    };
}

/** 从 `/api/hold`（`public/items/hold.json`）读取并设为当前配置；失败时保持原值（默认值）。 */
export async function loadHoldStyle(): Promise<HoldStyleConfig> {
    try {
        const res = await fetch("/api/hold");
        if (res.ok) {
            const data = (await res.json()) as unknown;
            setHoldStyle(parseHoldStyle(data));
        }
    } catch (error) {
        console.warn("Hold style config load failed (using defaults)", error);
    }
    return current;
}
