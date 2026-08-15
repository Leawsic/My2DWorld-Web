// 生物碰撞箱配置：从 /api/hitboxes（public/hitboxes 下的 JSON 文件）加载，
// 允许按 kind 覆盖内置的 MOB_KINDS 默认碰撞箱。加载失败时回退到内置默认值。

export interface HitboxConfig {
    halfWidth: number;
    height: number;
}

const overrides = new Map<string, HitboxConfig>();

let loaded = false;

/** 碰撞箱配置是否已从服务端加载完成（加载失败也算完成，回退默认值）。 */
export function isHitboxesLoaded(): boolean {
    return loaded;
}

/** 从服务端加载 public/hitboxes 目录下的碰撞箱配置（kind → {halfWidth, height}）。 */
export async function loadHitboxes(): Promise<void> {
    loaded = false;
    try {
        const res = await fetch("/api/hitboxes");
        if (res.ok) {
            const data = (await res.json()) as {hitboxes?: Record<string, HitboxConfig>};
            overrides.clear();
            for (const [kind, config] of Object.entries(data.hitboxes ?? {})) {
                if (config && Number.isFinite(config.halfWidth) && Number.isFinite(config.height)) {
                    overrides.set(kind, {halfWidth: config.halfWidth, height: config.height});
                }
            }
        }
    } catch {
        // 配置加载失败：继续使用内置默认值
    } finally {
        loaded = true;
    }
}

/** 指定 kind 的碰撞箱覆盖配置；没有配置时为 null（使用内置默认值）。 */
export function hitboxFor(kind: string): HitboxConfig | null {
    return overrides.get(kind) ?? null;
}
