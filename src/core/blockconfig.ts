import {blockRegistry} from "./registry";
import type {BlockDefinition} from "./block";

/** 从 /api/blocks（public/blocks）加载方块定义并覆盖/追加到方块注册表。 */
export async function loadBlockConfigs(): Promise<void> {
    try {
        const res = await fetch("/api/blocks");
        if (!res.ok) return;
        const data = (await res.json()) as {blocks?: Record<string, BlockDefinition>};
        for (const [id, definition] of Object.entries(data.blocks ?? {})) {
            if (!id || !definition || typeof definition.color !== "string") continue;
            const label = definition.label;
            if (!label || typeof label.zh !== "string" || typeof label.en !== "string") continue;
            blockRegistry.upsert({...definition, id});
        }
    } catch {
        // 加载失败：继续使用内置方块定义
    }
}