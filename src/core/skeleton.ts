import {MOB_KINDS, type MobKind} from "./entity";
import {Animation} from "./anim";
import {loadCharacterAnimations, loadAnimationUrl} from "./animations";

export type CharacterKind = "player" | MobKind;
export type CharacterPose = "idle" | "walk" | "attack";
/** 动画模板家族：插件按家族+姿态注册，覆盖该家族所有变体。 */
export type AnimationFamily = "player" | "zombie" | "cow" | "pig";
export type AnimationPose = CharacterPose;

export interface CharacterRenderOptions {
    kind: CharacterKind;
    pose: CharacterPose;
    time: number;
    x: number;
    y: number;
    facing: number;
    blockSize: number;
    cameraX: number;
    cameraY: number;
    alpha?: number;
    brightness?: number;
    tint?: string;
    tintAmount?: number;
}

const images = new Map<string, HTMLImageElement>();
const particleTextures = new Map<CharacterKind, HTMLCanvasElement>();

/** 预加载的模板动画，key 为 `<家族>/<姿态>`（如 `cow/stand`、`player/walk`）。 */
const characterAnims = new Map<string, Animation>();
/** 插件注册的模板动画（家族+姿态），优先级高于文件动画，不会被文件预加载清空。 */
const pluginAnims = new Map<string, Animation>();
/** 按 kind+姿态缓存的变体动画（由模板经骨架变体纹理替换生成）。 */
const variantAnims = new Map<string, Animation>();
let preloadPromise: Promise<void> | null = null;

type Family = "player" | "zombie" | "cow" | "pig";

const SKELETON_GROUP: Record<Family, string> = {
    player: "players",
    zombie: "zombies",
    cow: "cows",
    pig: "pigs",
};

/** .myanim 模板引用的骨架变体目录名（player→hitler、zombie→zombie、cow/pig→temperate 品种）。 */
const TEMPLATE_VARIANT: Record<Family, string> = {
    player: "hitler",
    zombie: "zombie",
    cow: "cow_temperate",
    pig: "pig_temperate",
};

const FALLBACK_POSES = ["idle", "stand"] as const;

function familyOf(kind: CharacterKind): Family | null {
    if (kind === "player") return "player";
    const base = kind.replace(/_baby$/, "");
    if (base === "zombie" || base === "husk" || base === "drowned") return "zombie";
    if (base.startsWith("pig")) return "pig";
    if (base.startsWith("cow") || base.startsWith("mooshroom")) return "cow";
    return null;
}

/** kind 对应的骨架变体目录名。 */
function skeletonVariantOf(kind: CharacterKind): string {
    return kind === "player" ? TEMPLATE_VARIANT.player : kind;
}

/** 把 .myanim 模板里的骨架变体目录段替换为指定 kind 的实际目录段。 */
function variantTransform(group: string, variant: string): (url: string) => string {
    const pattern = new RegExp(`(/assets/skeleton/${group}/)[^/]+(?=/)`);
    return (url) => url.replace(pattern, `$1${variant}`);
}

/** 依据 /api/animations 清单预加载字符动画（失败/缺失的 kind 继续使用内置骨架）。 */
export function preloadCharacterAnimations(manifest: string[]): Promise<void> {
    if (preloadPromise) return preloadPromise;
    preloadPromise = loadCharacterAnimations(manifest).then((loaded) => {
        characterAnims.clear();
        variantAnims.clear();
        for (const [key, animation] of loaded) characterAnims.set(key, animation);
    });
    return preloadPromise;
}

/**
 * 插件注册一个家族的姿态动画（覆盖同家族所有 kind 变体）。
 * `url` 通常是 `api.asset()` 生成的插件内资源地址。加载失败返回 false。
 */
export async function registerPluginAnimation(family: AnimationFamily, pose: AnimationPose, url: string): Promise<boolean> {
    const separator = url.includes("?") ? "&" : "?";
    const animation = await loadAnimationUrl(`${url}${separator}t=${Date.now()}`);
    if (!animation) return false;
    pluginAnims.set(`${family}/${pose}`, animation);
    return true;
}

/** 清空插件注册的动画（重载扩展时使用）。 */
export function clearPluginAnimations(): void {
    pluginAnims.clear();
}

/** 清空文件动画、变体缓存、缩放缓存与预加载状态（重载动画/图片时使用）。插件动画保留。 */
export function clearCharacterAnimationState(): void {
    characterAnims.clear();
    variantAnims.clear();
    scaleCache.clear();
    preloadPromise = null;
}

/** 重新从 /api/animations 清单加载文件动画并重建相关缓存。 */
export async function reloadCharacterAnimations(): Promise<void> {
    clearCharacterAnimationState();
    try {
        const res = await fetch("/api/animations");
        if (res.ok) {
            const data = (await res.json()) as {animations?: string[]};
            await preloadCharacterAnimations(data.animations ?? []);
        }
    } catch {
        // 重载失败：保持内置骨架渲染
    }
}

/** 清空骨架部件贴图缓存（角色 PNG 与死亡粒子纹理），下次渲染时重新请求。 */
export function reloadCharacterImages(): void {
    images.clear();
    particleTextures.clear();
    variantAnims.clear();
    scaleCache.clear();
    for (const animation of characterAnims.values()) animation.invalidateImages?.();
    for (const animation of pluginAnims.values()) animation.invalidateImages?.();
}

function assetFor(kind: CharacterKind): string {
    const family = familyOf(kind);
    if (!family) return kind;
    return `${SKELETON_GROUP[family]}/${skeletonVariantOf(kind)}`;
}

function imageFor(asset: string, part: string): HTMLImageElement {
    const key = `${asset}/${part}`;
    let image = images.get(key);
    if (!image) {
        image = new Image();
        image.src = `/assets/skeleton/${asset}/${part}.png`;
        images.set(key, image);
    }
    return image;
}

function triangleWave(time: number): number {
    const phase = ((time % 1) + 1) % 1;
    return phase <= 0.5 ? phase * 2 : 2 - phase * 2;
}

function dimensions(image: HTMLImageElement, fallback: readonly [number, number]): readonly [number, number] {
    return image.naturalWidth ? [image.naturalWidth, image.naturalHeight] : fallback;
}

function drawPart(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, pivotX: number, pivotY: number, angle: number, brightness: number, tint?: string, tintAmount = 0): void {
    if (!image.complete || !image.naturalWidth) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1); // Source PNGs have .myanim's local y-down orientation.
    ctx.rotate(angle);
    ctx.drawImage(image, -pivotX * image.naturalWidth, -pivotY * image.naturalHeight);
    if (brightness < 1) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = 1 - Math.max(0, brightness);
        ctx.fillStyle = "#000";
        ctx.fillRect(-pivotX * image.naturalWidth, -pivotY * image.naturalHeight, image.naturalWidth, image.naturalHeight);
    }
    if (tint && tintAmount > 0) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = Math.max(0, Math.min(1, tintAmount));
        ctx.fillStyle = tint;
        ctx.fillRect(-pivotX * image.naturalWidth, -pivotY * image.naturalHeight, image.naturalWidth, image.naturalHeight);
    }
    ctx.restore();
}

function renderHumanoid(ctx: CanvasRenderingContext2D, asset: string, opt: CharacterRenderOptions, brightness: number): void {
    const torso = imageFor(asset, "torso");
    const head = imageFor(asset, "head");
    const armL = imageFor(asset, "armL");
    const armR = imageFor(asset, "armR");
    const legL = imageFor(asset, "legL");
    const legR = imageFor(asset, "legR");
    const itemL = imageFor(asset, "itemL");
    const itemR = imageFor(asset, "itemR");
    const [, torsoH] = dimensions(torso, asset.endsWith("_baby") ? [4, 10] : [8, 24]);
    const [, legH] = dimensions(legL, asset.endsWith("_baby") ? [4, 8] : [8, 24]);
    const bodyY = torsoH / 2 + legH;
    const hipY = legH;
    const shoulderY = bodyY + torsoH * (0.5 - 0.1667);
    const headY = bodyY + torsoH / 2;
    const u = triangleWave(opt.time);
    const degree = Math.PI / 180;
    const walking = opt.pose === "walk";
    const player = opt.kind === "player";
    const legLeftAngle = walking ? (-25 + 50 * u) * degree : 0;
    const legRightAngle = walking ? (25 - 50 * u) * degree : 0;
    const attackPhase = (opt.time % 0.75 + 0.75) % 0.75;
    const attackAngle = attackPhase < 0.5 ? (-90 - 90 * attackPhase / 0.5) * degree : (-180 + 90 * (attackPhase - 0.5) / 0.25) * degree;
    const armLeftAngle = opt.pose === "attack" ? attackAngle : player ? (walking ? (30 - 60 * u) * degree : 0) : -90 * degree;
    const armRightAngle = opt.pose === "attack" ? attackAngle : player ? (walking ? (-30 + 60 * u) * degree : 0) : -90 * degree;
    const [, armH] = dimensions(armL, asset.endsWith("_baby") ? [4, 10] : [8, 24]);
    const handOffset = armH * (0.8333 - 0.1667);
    const hand = (angle: number) => ({x: -Math.sin(angle) * handOffset, y: -Math.cos(angle) * handOffset});
    const leftHand = hand(armLeftAngle);
    const rightHand = hand(armRightAngle);

    ctx.scale(SKELETON_PIXEL_BLOCK, SKELETON_PIXEL_BLOCK);
    drawPart(ctx, armL, 0, shoulderY, 0.5, 0.1667, armLeftAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, itemL, leftHand.x, shoulderY + leftHand.y, 0.5, 0.5, armLeftAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, legL, 0, hipY, 0.5, 0, legLeftAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, torso, 0, bodyY, 0.5, 0.5, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, head, 0, headY, 0.5, 1, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, legR, 0, hipY, 0.5, 0, legRightAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, itemR, rightHand.x, shoulderY + rightHand.y, 0.5, 0.5, armRightAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, armR, 0, shoulderY, 0.5, 0.1667, armRightAngle, brightness, opt.tint, opt.tintAmount);
}

function renderQuadruped(ctx: CanvasRenderingContext2D, kind: CharacterKind, opt: CharacterRenderOptions, brightness: number): void {
    const cow = familyOf(kind) === "cow";
    const asset = assetFor(kind);
    const body = imageFor(asset, "body");
    const head = imageFor(asset, "head");
    const nose = imageFor(asset, "nose");
    const feet = imageFor(asset, "feet");
    const [bodyW, bodyH] = dimensions(body, cow ? [36, 20] : [32, 16]);
    const [, feetH] = dimensions(feet, cow ? [8, 16] : [8, 12]);
    const bodyY = bodyH / 2 + feetH;
    const footY = feetH;
    const hindX = (cow ? 0.1875 : 0.0625) * bodyW - bodyW / 2;
    const foreX = (cow ? 0.8125 : 0.8125) * bodyW - bodyW / 2;
    const headX = (cow ? 1 : 0.875) * bodyW - bodyW / 2;
    const headY = bodyY + bodyH / 2 - (cow ? 0.6 : 0.6875) * bodyH;
    const u = triangleWave(opt.time);
    const swing = opt.pose === "walk" ? (-30 + 60 * u) * Math.PI / 180 : 0;

    ctx.scale(SKELETON_PIXEL_BLOCK, SKELETON_PIXEL_BLOCK);
    drawPart(ctx, feet, hindX, footY, 0.5, 0, swing, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, feet, foreX, footY, 0.5, 0, swing, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, body, 0, bodyY, 0.5, 0.5, 0, brightness, opt.tint, opt.tintAmount);
    if (kind === "cow_cold") drawPart(ctx, imageFor(asset, "fur"), 0, bodyY, 0.5, 0.35, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, head, headX, headY, 0, 1, 0, brightness, opt.tint, opt.tintAmount);
    const [headW, headH] = dimensions(head, cow ? [12, 16] : [16, 16]);
    drawPart(ctx, nose, headX + headW, headY - headH / 2, 0.5, 0, 0, brightness, opt.tint, opt.tintAmount);
    if (cow) drawPart(ctx, imageFor(asset, "ear"), headX + headW * 0.75, headY + headH * 0.3125, 0.5, 0.8333, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, feet, hindX, footY, 0.5, 0, -swing, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, feet, foreX, footY, 0.5, 0, -swing, brightness, opt.tint, opt.tintAmount);
}

/** 取角色动画：优先插件注册的家族动画（不替换变体），否则按家族+姿态查找文件模板并按 kind 替换变体纹理并缓存；都没有则用内置骨架。 */
function animationFor(kind: CharacterKind, pose: CharacterPose): Animation | null {
    const family = familyOf(kind);
    if (!family) return null;
    for (const key of [pose, ...FALLBACK_POSES]) {
        const plugin = pluginAnims.get(`${family}/${key}`);
        if (plugin) return plugin;
    }
    let template: Animation | null = null;
    let usedPose: string = pose;
    for (const key of [pose, ...FALLBACK_POSES]) {
        const animation = characterAnims.get(`${family}/${key}`);
        if (animation) {
            template = animation;
            usedPose = key;
            break;
        }
    }
    if (!template) return null;
    const variant = skeletonVariantOf(kind);
    if (variant === TEMPLATE_VARIANT[family]) return template;
    const cacheKey = `${kind}/${usedPose}`;
    const cached = variantAnims.get(cacheKey);
    if (cached) return cached;
    const created = new Animation(template.def, "", variantTransform(SKELETON_GROUP[family], variant));
    variantAnims.set(cacheKey, created);
    return created;
}

/** 骨骼渲染统一尺寸：源图 1 像素 = 1/4 方块（不再按碰撞箱高度缩放）。 */
const SKELETON_PIXEL_BLOCK = 0.25;

const scaleCache = new Map<Animation, number>();

/** 动画局部单位对应的方块数，使源图 1 像素渲染为 SKELETON_PIXEL_BLOCK 个方块。
 * 显式指定 w 的动画（player/zombie 模板按方块单位创作）按 图片像素÷显示宽 换算；
 * 未指定尺寸的动画（cow/pig 模板）1 局部单位即 1 源图像素。图片未就绪时暂按
 * 1 单位=1 像素渲染且不缓存，加载完成后重算。 */
function unitScaleFor(animation: Animation): number {
    const cached = scaleCache.get(animation);
    if (cached) return cached;
    const ratios: number[] = [];
    for (const obj of animation.def.objects ?? []) {
        if (obj.type !== "image" || !obj.image || typeof obj.w !== "number" || obj.w <= 0) continue;
        const image = animation.images.get(obj.id ?? obj.image);
        if (!image || !image.complete || !image.naturalWidth) continue;
        ratios.push(image.naturalWidth / obj.w);
    }
    if (!ratios.length) return SKELETON_PIXEL_BLOCK;
    ratios.sort((a, b) => a - b);
    // 取中位数：个别部件的 authored 尺寸偏差（如头部 0.45）不影响整体比例
    const scale = SKELETON_PIXEL_BLOCK * ratios[ratios.length >> 1];
    scaleCache.set(animation, scale);
    return scale;
}

/** 用 .myanim 文件绘制角色，锚点在世界坐标（x,y）（角色脚底），坐标单位为游戏方块；
 * 渲染比例统一为源图 1 像素 = 1/4 方块。 */
function renderCharacterFromAnimation(ctx: CanvasRenderingContext2D, animation: Animation, opt: CharacterRenderOptions): void {
    const scale = unitScaleFor(animation);
    const screenX = (opt.x - opt.cameraX) * opt.blockSize + ctx.canvas.width / 2;
    const screenY = (opt.cameraY - opt.y) * opt.blockSize + ctx.canvas.height / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(screenX, screenY);
    ctx.scale((opt.facing < 0 ? -1 : 1) * opt.blockSize * scale, -opt.blockSize * scale);
    animation.render(ctx, opt.time, {
        alpha: opt.alpha,
        brightness: opt.brightness,
        tint: opt.tint,
        tintAmount: opt.tintAmount,
    });
    ctx.restore();
}

/** Draws source .myanim parts in game-world coordinates, anchored at the entity's feet. */
export function renderCharacter(ctx: CanvasRenderingContext2D, opt: CharacterRenderOptions): void {
    const fileAnimation = animationFor(opt.kind, opt.pose);
    if (fileAnimation) {
        renderCharacterFromAnimation(ctx, fileAnimation, opt);
        return;
    }
    const config = opt.kind === "player" ? undefined : MOB_KINDS[opt.kind];
    const asset = assetFor(opt.kind);
    const brightness = Math.max(0, opt.brightness ?? 1);
    const screenX = (opt.x - opt.cameraX) * opt.blockSize + ctx.canvas.width / 2;
    const screenY = (opt.cameraY - opt.y) * opt.blockSize + ctx.canvas.height / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0, Math.min(1, opt.alpha ?? 1));
    ctx.translate(screenX, screenY);
    ctx.scale((opt.facing < 0 ? -1 : 1) * opt.blockSize, -opt.blockSize);
    if (!config || config.shape === "humanoid") renderHumanoid(ctx, asset, opt, brightness);
    else renderQuadruped(ctx, opt.kind, opt, brightness);
    ctx.restore();
}

/** Combines source part PNGs into a texture from which death particles are sampled. */
export function characterParticleTexture(kind: CharacterKind): HTMLCanvasElement {
    const cached = particleTextures.get(kind);
    if (cached) return cached;
    const asset = assetFor(kind);
    const config = kind === "player" ? undefined : MOB_KINDS[kind];
    const parts = !config || config.shape === "humanoid"
        ? ["head", "torso", "armL", "armR", "legL", "legR", "itemL", "itemR"]
        : config.shape === "pig"
            ? ["body", "head", "nose", "feet"]
            : ["body", "head", "nose", "feet", "ear", ...(kind === "cow_cold" ? ["fur"] : [])];
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const draw = () => {
        ctx.clearRect(0, 0, 64, 64);
        let x = 0, y = 0;
        for (const part of parts) {
            const image = imageFor(asset, part);
            if (image.complete && image.naturalWidth) {
                ctx.drawImage(image, x, y);
                x += image.naturalWidth;
                if (x >= 48) {
                    x = 0;
                    y += 20;
                }
            }
        }
    };
    for (const part of parts) {
        const image = imageFor(asset, part);
        if (!image.complete) image.addEventListener("load", draw, {once: true});
    }
    draw();
    particleTextures.set(kind, canvas);
    return canvas;
}
