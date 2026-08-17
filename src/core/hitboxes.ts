// 生物碰撞箱配置：从 /api/hitboxes（public/hitboxes 下的 JSON 文件）加载，
// 按「大/小 × 牛/猪/僵尸」分类覆盖内置的 MOB_KINDS 默认碰撞箱（如 cow.json
// 覆盖全部成年牛/哞菇，pig_baby.json 覆盖全部小猪）。加载失败时回退到内置默认值。
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

/** 从服务端加载 public/hitboxes 目录下的碰撞箱配置（分类或 kind → {halfWidth, height, centerX, centerY}）。 */
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

/** kind 所属的碰撞箱分类：僵尸/尸壳/溺尸→zombie，猪→pig，牛/哞菇→cow，
 * 幼体加 `_baby` 后缀（大牛小牛、大猪小猪、大僵尸小僵尸各一份配置）。
 * 不属于任何家族的 kind 原样返回（可按具体 kind 单独配置）。 */
export function hitboxCategoryOf(kind: string): string {
    const baby = kind.endsWith("_baby");
    const base = baby ? kind.slice(0, -"_baby".length) : kind;
    let family: string | null = null;
    if (base === "zombie" || base === "husk" || base === "drowned") family = "zombie";
    else if (base.startsWith("pig")) family = "pig";
    else if (base.startsWith("cow") || base.startsWith("mooshroom")) family = "cow";
    if (!family) return kind;
    return baby ? `${family}_baby` : family;
}

/** 指定 kind 的碰撞箱覆盖配置；没有配置时为 null（使用内置默认值）。
 * 查找顺序：精确 kind → 所属分类（大/小×牛/猪/僵尸），插件注册优先于文件配置。 */
export function hitboxFor(kind: string): HitboxConfig | null {
    const category = hitboxCategoryOf(kind);
    return pluginOverrides.get(kind) ?? pluginOverrides.get(category)
        ?? overrides.get(kind) ?? overrides.get(category) ?? null;
}

/** 扩展（插件）运行时注册一个碰撞箱覆盖：kind 可为具体 kind 或分类名
 * （`cow`/`cow_baby`/`pig`/`pig_baby`/`zombie`/`zombie_baby`，覆盖整个分类）。 */
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
