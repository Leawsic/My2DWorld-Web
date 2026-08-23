// 生物碰撞箱配置：从 /api/hitboxes（public/hitboxes 下的 JSON 文件）加载，
// 按「大/小 × 牛/猪/僵尸」分类覆盖内置的 MOB_KINDS 默认碰撞箱（如 cow.json
// 覆盖全部成年牛/哞菇，pig_baby.json 覆盖全部小猪）。加载失败时回退到内置默认值。
//
// 碰撞箱中心相对 mob 位置 (x, y) 的偏移为 centerX/centerY（方块为单位）。
// 物理碰撞、点击/占用判定与 F5 可视化共用同一碰撞箱；centerY 默认 height/2
// （即脚底锚定：箱底在 y）。
//
// 碰撞箱支持由多个矩形合并（boxes 并集）组成：物理/挤压用并集包围盒，点击、
// 占用、F5 与精确重叠判定用每个矩形。支持按左右朝向分别配置：
//   - `left` / `right`：面朝左（facing=-1）/ 面朝右（facing=1）的矩形列表（显式配置优先）；
//   - 未提供 `left` 时，对基础矩形按 x 轴做水平镜像（centerX 取反）。

export interface HitboxRect {
    halfWidth: number;
    height: number;
    /** 矩形中心相对 mob.x 的水平偏移（方块），默认 0。 */
    centerX?: number;
    /** 矩形中心相对 mob.y 的竖直偏移（方块），默认 height/2（脚底锚定）。 */
    centerY?: number;
}

export interface HitboxConfig {
    // —— 传统单矩形字段（向后兼容）——
    halfWidth?: number;
    height?: number;
    centerX?: number;
    centerY?: number;
    // —— 多矩形并集：提供时优先于单矩形字段 ——
    boxes?: HitboxRect[];
    /** 面朝左（facing=-1）时的矩形列表；缺省时对基础矩形水平镜像。 */
    left?: HitboxRect[];
    /** 面朝右（facing=1）时的矩形列表；缺省时使用基础矩形。 */
    right?: HitboxRect[];
}

/** 归一化后的碰撞箱：boxes 为基础矩形，left/right 为朝向指定矩形（可选）。 */
export interface NormalizedHitbox {
    boxes: HitboxRect[];
    left?: HitboxRect[];
    right?: HitboxRect[];
}

/**
 * public/hitboxes 与 public/squeeze 文件使用的长度单位：1 块 = 32 个文件单位，
 * 且文件内数值要求为整数（作者友好，避免小数）。游戏内部仍以「块」为单位，
 * 因此在加载时会把文件单位除以 32 换算回块。
 */
export const HITBOX_FILE_UNIT = 32;

/** 把文件中的 32 倍整数长度单位换算回块（乘以 factor）。 */
export function scaleHitboxConfig(config: HitboxConfig, factor: number): HitboxConfig {
    const scaleRect = (rect: HitboxRect): HitboxRect => ({
        halfWidth: rect.halfWidth * factor,
        height: rect.height * factor,
        centerX: Number.isFinite(rect.centerX) ? (rect.centerX as number) * factor : undefined,
        centerY: Number.isFinite(rect.centerY) ? (rect.centerY as number) * factor : undefined,
    });
    const scaleRects = (rects: HitboxRect[] | undefined): HitboxRect[] | undefined => rects?.map(scaleRect);
    return {
        halfWidth: Number.isFinite(config.halfWidth) ? (config.halfWidth as number) * factor : undefined,
        height: Number.isFinite(config.height) ? (config.height as number) * factor : undefined,
        centerX: Number.isFinite(config.centerX) ? (config.centerX as number) * factor : undefined,
        centerY: Number.isFinite(config.centerY) ? (config.centerY as number) * factor : undefined,
        boxes: scaleRects(config.boxes),
        left: scaleRects(config.left),
        right: scaleRects(config.right),
    };
}

/** 服务端文件（public/hitboxes/*.json）加载的覆盖配置。 */
const overrides = new Map<string, NormalizedHitbox>();
/** 扩展（插件）运行时注册的覆盖配置，优先级高于文件配置。 */
const pluginOverrides = new Map<string, NormalizedHitbox>();

let loaded = false;

function normalizeCenterY(centerY: number | undefined, height: number): number {
    return Number.isFinite(centerY) ? centerY as number : height / 2;
}

/** 把单个矩形归一化（校验 halfWidth/height，补默认 centerX/centerY）。 */
function normalizeRect(rect: HitboxRect): HitboxRect | null {
    if (!rect || !Number.isFinite(rect.halfWidth) || !Number.isFinite(rect.height)) return null;
    return {
        halfWidth: rect.halfWidth as number,
        height: rect.height as number,
        centerX: Number.isFinite(rect.centerX) ? rect.centerX as number : 0,
        centerY: normalizeCenterY(rect.centerY, rect.height as number),
    };
}

/** 归一化矩形列表；空/非法返回 undefined。 */
function normalizeRects(list: HitboxRect[] | undefined): HitboxRect[] | undefined {
    if (!Array.isArray(list) || !list.length) return undefined;
    const out: HitboxRect[] = [];
    for (const rect of list) {
        const normalized = normalizeRect(rect);
        if (normalized) out.push(normalized);
    }
    return out.length ? out : undefined;
}

/** 把配置归一化为标准矩形结构；无法解析（缺 halfWidth/height 且无 boxes）返回 null。 */
export function normalizeHitbox(config: HitboxConfig | null | undefined): NormalizedHitbox | null {
    if (!config) return null;
    const boxes = normalizeRects(config.boxes);
    if (boxes) {
        return {boxes, left: normalizeRects(config.left), right: normalizeRects(config.right)};
    }
    if (Number.isFinite(config.halfWidth) && Number.isFinite(config.height)) {
        const rect = normalizeRect({
            halfWidth: config.halfWidth as number,
            height: config.height as number,
            centerX: config.centerX,
            centerY: config.centerY,
        } as HitboxRect)!;
        return {boxes: [rect], left: normalizeRects(config.left), right: normalizeRects(config.right)};
    }
    return null;
}

/** 归一并镜像的矩形列表。 */
function mirrorRects(rects: HitboxRect[]): HitboxRect[] {
    return rects.map((rect) => ({...rect, centerX: -(rect.centerX ?? 0)}));
}

/** 按朝向（facing < 0 面左）取归一化后的矩形列表；显式 left/right 优先，否则镜像基础矩形。 */
export function rectsForFacing(hitbox: NormalizedHitbox, facing: number): HitboxRect[] {
    const side = facing < 0 ? hitbox.left : hitbox.right;
    if (side?.length) return side;
    return facing < 0 ? mirrorRects(hitbox.boxes) : hitbox.boxes;
}

/** 碰撞箱配置是否已从服务端加载完成（加载失败也算完成，回退默认值）。 */
export function isHitboxesLoaded(): boolean {
    return loaded;
}

/** 从服务端加载 public/hitboxes 目录下的碰撞箱配置。 */
export async function loadHitboxes(): Promise<void> {
    loaded = false;
    try {
        const res = await fetch("/api/hitboxes");
        if (res.ok) {
            const data = (await res.json()) as {hitboxes?: Record<string, HitboxConfig>};
            overrides.clear();
            for (const [kind, config] of Object.entries(data.hitboxes ?? {})) {
                // 文件以 32 倍整数长度单位书写：先换算回块，再归一化。
                const normalized = normalizeHitbox(scaleHitboxConfig(config, 1 / HITBOX_FILE_UNIT));
                if (normalized) overrides.set(kind, normalized);
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

/** 指定 kind 的碰撞箱（归一化）覆盖配置；没有配置时为 null（使用内置默认值）。
 * 查找顺序：精确 kind → 所属分类（大/小×牛/猪/僵尸），插件注册优先于文件配置。 */
export function hitboxFor(kind: string): NormalizedHitbox | null {
    const category = hitboxCategoryOf(kind);
    return pluginOverrides.get(kind) ?? pluginOverrides.get(category)
        ?? overrides.get(kind) ?? overrides.get(category) ?? null;
}

/** 扩展（插件）运行时注册一个碰撞箱覆盖：kind 可为具体 kind 或分类名
 * （`cow`/`cow_baby`/`pig`/`pig_baby`/`zombie`/`zombie_baby`，覆盖整个分类）。 */
export function registerHitbox(kind: string, config: HitboxConfig): void {
    const normalized = normalizeHitbox(config);
    if (!normalized) return;
    pluginOverrides.set(kind, normalized);
}

/** 扩展（插件）运行时批量注册碰撞箱覆盖。 */
export function setHitboxes(configs: Record<string, HitboxConfig>): void {
    for (const [kind, config] of Object.entries(configs)) registerHitbox(kind, config);
}

/** 清空插件注册的碰撞箱覆盖（重载扩展时使用）。 */
export function clearPluginHitboxes(): void {
    pluginOverrides.clear();
}