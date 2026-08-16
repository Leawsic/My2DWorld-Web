// 生物碰撞箱配置：从 /api/hitboxes（public/hitboxes 下的 JSON 文件）加载，
// 允许按 kind 覆盖内置的 MOB_KINDS 默认碰撞箱。加载失败时回退到内置默认值。
// 碰撞箱中心相对 mob 位置 (x, y) 的偏移为 centerX/centerY（方块为单位）。
// 物理碰撞、点击/占用判定与 F5 可视化共用同一碰撞箱；centerY 默认 height/2
// （即脚底锚定：箱底在 y）。

export interface HitboxConfig {
    halfWidth: number;
    height: number;
    /** 碰撞箱中心相对 mob.x 的水平偏移（方块），默认 0。 */
    centerX?: number;
    /** 碰撞箱中心相对 mob.y 的竖直偏移（方块），默认 height/2（脚底锚定）。 */
    centerY?: number;
}

/** 服务端文件（public/hitboxes/*.json）加载的覆盖配置。 */
const overrides = new Map<string, HitboxConfig>();
/** 扩展（插件）运行时注册的覆盖配置，优先级高于文件配置。 */
const pluginOverrides = new Map<string, HitboxConfig>();

let loaded = false;

/** 碰撞箱配置是否已从服务端加载完成（加载失败也算完成，回退默认值）。 */
export function isHitboxesLoaded(): boolean {
    return loaded;
}

/** 从服务端加载 public/hitboxes 目录下的碰撞箱配置（kind → {halfWidth, height, centerX, centerY}）。 */
export async function loadHitboxes(): Promise<void> {
    loaded = false;
    try {
        const res = await fetch("/api/hitboxes");
        if (res.ok) {
            const data = (await res.json()) as {hitboxes?: Record<string, HitboxConfig>};
            overrides.clear();
            for (const [kind, config] of Object.entries(data.hitboxes ?? {})) {
                if (config && Number.isFinite(config.halfWidth) && Number.isFinite(config.height)) {
                    overrides.set(kind, {
                        halfWidth: config.halfWidth,
                        height: config.height,
                        centerX: Number.isFinite(config.centerX) ? config.centerX : 0,
                        centerY: Number.isFinite(config.centerY) ? config.centerY : undefined,
                    });
                }
            }
        }
    } catch {
        // 配置加载失败：继续使用内置默认值
    } finally {
        loaded = true;
    }
}

/** 指定 kind 的碰撞箱覆盖配置；没有配置时为 null（使用内置默认值）。插件注册优先于文件配置。 */
export function hitboxFor(kind: string): HitboxConfig | null {
    return pluginOverrides.get(kind) ?? overrides.get(kind) ?? null;
}

/** 扩展（插件）运行时注册一个 kind 的碰撞箱覆盖。 */
export function registerHitbox(kind: string, config: HitboxConfig): void {
    if (!config || !Number.isFinite(config.halfWidth) || !Number.isFinite(config.height)) return;
    pluginOverrides.set(kind, {
        halfWidth: config.halfWidth,
        height: config.height,
        centerX: Number.isFinite(config.centerX) ? config.centerX : 0,
        centerY: Number.isFinite(config.centerY) ? config.centerY : undefined,
    });
}

/** 扩展（插件）运行时批量注册碰撞箱覆盖。 */
export function setHitboxes(configs: Record<string, HitboxConfig>): void {
    for (const [kind, config] of Object.entries(configs)) registerHitbox(kind, config);
}

/** 清空插件注册的碰撞箱覆盖（重载扩展时使用）。 */
export function clearPluginHitboxes(): void {
    pluginOverrides.clear();
}
