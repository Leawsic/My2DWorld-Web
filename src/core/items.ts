// 物品（工具等非方块物品）注册表与纯规则。
//
// 配置来自 public/items/items.json（经 /api/items 加载），结构与 public/blocks/blocks.json 一致：
// id -> 定义，或 { "items": { id -> 定义 } }。定义里的挖掘速度 / 攻击伤害 / 耐久 / 堆叠上限
// 都由本文件提供查询函数，渲染与模式逻辑只调用这些函数，不再自己写公式。
//
// 本文件不依赖 DOM，可单独用 ts 探针验证。

import {MAX_STACK_SIZE, type ToolClass} from "./types";
import {Registry, type RegistryObject} from "./registry";

/** 合法的工具类别（items.json 里 tool 字段的取值）。 */
export const TOOL_CLASSES: readonly ToolClass[] = ["pickaxe", "axe", "shovel", "hoe", "sword"];

/** 物品定义。除 id / label 外都可省略，省略时回落到下面的默认值。 */
export interface ItemDefinition {
    readonly id: string;
    readonly namespace?: string;
    readonly path?: string;
    /** 显示名（与方块一样直接写在 JSON 里，不走 i18n 表）。 */
    readonly label: {zh: string; en: string};
    /** 贴图文件名（不含扩展名），相对 public/assets/items/；缺省用 id 的 path（去掉命名空间）。 */
    readonly texture?: string;
    /** 工具类别：与方块 tool 一致时按 miningSpeed 加速挖掘。 */
    readonly tool?: ToolClass;
    /** 材质等级（wood / stone / copper / iron / golden / diamond / netherite），仅用于分组与展示。 */
    readonly tier?: string;
    /** 挖掘速度倍率：手持对口工具时耗时 = 方块硬度 / miningSpeed（空手为 1）。缺省 1。 */
    readonly miningSpeed?: number;
    /** 攻击伤害；缺省时沿用 attackConfig 的玩家伤害（空手 2）。 */
    readonly damage?: number;
    /** 耐久上限：> 0 时每次挖掘/攻击消耗 1 点，归零损坏。缺省 0 = 不消耗耐久。 */
    readonly durability?: number;
    /** 单格堆叠上限（1..MAX_STACK_SIZE）。缺省 MAX_STACK_SIZE。 */
    readonly stackSize?: number;
}

export type ItemObject = ItemDefinition & RegistryObject;

/** 物品注册表（带命名空间，与方块注册表同构）。 */
export const itemRegistry = new Registry<ItemObject>();
/** 动态命名空间，例如 Items.MY2DWORLD.WOODEN_PICKAXE。 */
export const Items: Record<string, any> = itemRegistry.namespace;

function positive(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 安全查询物品注册表：Registry.get 对语法非法的 id 会抛错（存档里可能有脏 id），
 * 这里统一吞掉异常返回 undefined，避免一条坏 id 让整个存档加载失败。
 */
function safeItem(id: string | null | undefined): ItemObject | undefined {
    if (!id) return undefined;
    try {
        return itemRegistry.get(id);
    } catch {
        return undefined;
    }
}

/** 物品定义；未知 id 返回 undefined。 */
export function itemDefinition(id: string | null | undefined): ItemObject | undefined {
    return safeItem(id);
}

/** 手持的这个 id 是否是「工具」（物品定义里带 `tool` 字段：镐/斧/剑/锹/锄）。
 *  渲染层据此决定 itemL/idemR 节点用 `public/items/hold.json` 的工具几何（见 core/holdstyle.ts）。 */
export function isToolItem(id: string | null | undefined): boolean {
    return !!itemDefinition(id)?.tool;
}

/** 单格堆叠上限：物品配置优先（夹紧到 1..MAX_STACK_SIZE），否则 MAX_STACK_SIZE。 */
export function stackLimit(id: string | null | undefined): number {
    const size = itemDefinition(id)?.stackSize;
    if (size === undefined || size === null) return MAX_STACK_SIZE;
    const n = Math.floor(Number(size));
    return Number.isFinite(n) ? Math.max(1, Math.min(MAX_STACK_SIZE, n)) : MAX_STACK_SIZE;
}

/** 耐久上限（0 = 该物品不消耗耐久）。 */
export function maxDurabilityFor(id: string | null | undefined): number {
    const durability = itemDefinition(id)?.durability;
    if (durability === undefined || durability === null) return 0;
    return Math.floor(positive(durability, 0));
}

/**
 * 手持 heldId 挖掘「要求 blockTool 类工具」的方块时的速度倍率。
 * 只有工具类别与方块要求一致才加速（如镐挖石头、斧砍原木、锹铲泥土、锄收树叶）；
 * 空手、类别不符（拿剑砍石头）都是 1 —— 也就是原有的空手速度。
 */
export function miningSpeedFor(heldId: string | null | undefined, blockTool: string | null | undefined): number {
    if (!heldId || !blockTool) return 1;
    const definition = itemDefinition(heldId);
    if (!definition || definition.tool !== blockTool) return 1;
    return positive(definition.miningSpeed, 1);
}

/** 手持 heldId 攻击的伤害；未配置 damage 的物品/空手回落到 fallback（attackConfig 的玩家伤害）。 */
export function attackDamageFor(heldId: string | null | undefined, fallback: number): number {
    const damage = itemDefinition(heldId)?.damage;
    if (damage === undefined || damage === null) return fallback;
    return positive(damage, fallback);
}

/** 单格方块的最短挖掘耗时（秒）：草/花这类 hardness 极小的方块不会瞬间完成，仍有一帧级动画。 */
export const MIN_MINING_SECONDS = 0.05;

/**
 * 挖掘一格的耗时（秒）= 硬度 / 速度。
 * 硬度缺省 1、非正数或非法值按 MIN_MINING_SECONDS 兜底；速度非法/非正按 1（空手）兜底。
 * 生存模式的挖掘进度就是 `mineProgress += dt / miningSeconds(...)`（满 1 时破坏方块）。
 */
export function miningSeconds(hardness: number | null | undefined, speed: number | null | undefined): number {
    const base = Math.max(MIN_MINING_SECONDS, Number.isFinite(hardness) ? (hardness as number) : 1);
    const rate = Number.isFinite(speed) && (speed as number) > 0 ? (speed as number) : 1;
    return base / rate;
}

/** 物品贴图路径（相对站点根）；未配置 texture 时用 id 的 path。 */
export function itemTextureSrc(id: string | null | undefined): string | undefined {
    const definition = itemDefinition(id);
    if (!definition) return undefined;
    const texture = definition.texture || definition.path || id;
    if (!texture) return undefined;
    return texture.startsWith("/") ? texture : `/assets/items/${texture}.png`;
}

/** 归一化持久化用的耐久值：夹紧到 0..上限，无耐久的物品返回 undefined（不写入存档）。 */
export function normalizeDurability(id: string, durability: unknown): number | undefined {
    const max = maxDurabilityFor(id);
    if (max <= 0) return undefined;
    const n = Number(durability);
    if (!Number.isFinite(n)) return max;
    return Math.max(0, Math.min(max, Math.floor(n)));
}

/** 从 /api/items（public/items/items.json）加载物品定义并覆盖/追加到物品注册表。 */
export async function loadItemConfigs(): Promise<void> {
    try {
        const res = await fetch("/api/items");
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown> | null;
        if (!data || typeof data !== "object") return;
        const nested = (data as {items?: unknown}).items;
        const source = (nested && typeof nested === "object" ? nested : data) as Record<string, ItemDefinition>;
        let loaded = 0;
        for (const [id, definition] of Object.entries(source)) {
            if (!id || !definition || typeof definition !== "object") continue;
            const label = definition.label;
            if (!label || typeof label.zh !== "string" || typeof label.en !== "string") continue;
            if (definition.tool !== undefined && !TOOL_CLASSES.includes(definition.tool)) continue;
            // 单条 id 非法（例如配置里写了注释键）只跳过这一条，不影响其余物品。
            try {
                itemRegistry.upsert({...definition, id});
                loaded += 1;
            } catch (error) {
                console.warn(`Skipped invalid item id "${id}"`, error);
            }
        }
        if (loaded === 0) console.warn("Item config loaded but contained no valid items (public/items/items.json)");
    } catch (error) {
        // 加载失败：物品表保持为空（方块不受影响）
        console.warn("Item config load failed", error);
    }
}
