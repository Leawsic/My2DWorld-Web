import {HITBOX_FILE_UNIT, normalizeHitbox, scaleHitboxConfig, type HitboxConfig, type NormalizedHitbox} from "./hitboxes";

const blockHitboxes = new Map<string, NormalizedHitbox>();

/** 从 /api/block-hitboxes（public/hitboxes/blocks.json）加载方块碰撞箱。 */
export async function loadBlockHitboxes(): Promise<void> {
    try {
        const res = await fetch("/api/block-hitboxes");
        if (!res.ok) return;
        const data = (await res.json()) as {blocks?: Record<string, HitboxConfig>};
        blockHitboxes.clear();
        for (const [id, config] of Object.entries(data.blocks ?? {})) {
            if (!id || !config) continue;
            const normalized = normalizeHitbox(scaleHitboxConfig(config, 1 / HITBOX_FILE_UNIT));
            if (normalized) blockHitboxes.set(id, normalized);
        }
    } catch {
        // 加载失败：无自定义方块碰撞箱
    }
}

/** 指定方块的碰撞箱（归一化，方块单位）；无配置时返回 null。 */
export function blockHitboxFor(id: string): NormalizedHitbox | null {
    return blockHitboxes.get(id) ?? null;
}