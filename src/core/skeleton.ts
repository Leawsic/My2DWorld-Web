import {MOB_KINDS, type MobKind} from "./entity";

export type CharacterKind = "player" | MobKind;
export type CharacterPose = "idle" | "walk" | "attack";

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

function assetFor(kind: CharacterKind): string {
    return kind === "player" ? "player" : MOB_KINDS[kind].asset;
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

function renderHumanoid(ctx: CanvasRenderingContext2D, asset: string, opt: CharacterRenderOptions, scale: number, brightness: number): void {
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
    const humanHeight = asset.endsWith("_baby") ? 30 : 64;
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

    ctx.scale(scale / humanHeight, scale / humanHeight);
    drawPart(ctx, armL, 0, shoulderY, 0.5, 0.1667, armLeftAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, itemL, leftHand.x, shoulderY + leftHand.y, 0.5, 0.5, armLeftAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, legL, 0, hipY, 0.5, 0, legLeftAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, torso, 0, bodyY, 0.5, 0.5, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, head, 0, headY, 0.5, 1, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, legR, 0, hipY, 0.5, 0, legRightAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, itemR, rightHand.x, shoulderY + rightHand.y, 0.5, 0.5, armRightAngle, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, armR, 0, shoulderY, 0.5, 0.1667, armRightAngle, brightness, opt.tint, opt.tintAmount);
}

function renderQuadruped(ctx: CanvasRenderingContext2D, asset: string, opt: CharacterRenderOptions, scale: number, brightness: number, cow: boolean): void {
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
    const totalHeight = cow ? 40 : 33;

    ctx.scale(scale / totalHeight, scale / totalHeight);
    drawPart(ctx, feet, hindX, footY, 0.5, 0, swing, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, feet, foreX, footY, 0.5, 0, swing, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, body, 0, bodyY, 0.5, 0.5, 0, brightness, opt.tint, opt.tintAmount);
    if (asset === "cow_cold") drawPart(ctx, imageFor(asset, "fur"), 0, bodyY, 0.5, 0.35, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, head, headX, headY, 0, 1, 0, brightness, opt.tint, opt.tintAmount);
    const [headW, headH] = dimensions(head, cow ? [12, 16] : [16, 16]);
    drawPart(ctx, nose, headX + headW, headY - headH / 2, 0.5, 0, 0, brightness, opt.tint, opt.tintAmount);
    if (cow) drawPart(ctx, imageFor(asset, "ear"), headX + headW * 0.75, headY + headH * 0.3125, 0.5, 0.8333, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, feet, hindX, footY, 0.5, 0, -swing, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, feet, foreX, footY, 0.5, 0, -swing, brightness, opt.tint, opt.tintAmount);
}

/** Draws source .myanim parts in game-world coordinates, anchored at the entity's feet. */
export function renderCharacter(ctx: CanvasRenderingContext2D, opt: CharacterRenderOptions): void {
    const config = opt.kind === "player" ? undefined : MOB_KINDS[opt.kind];
    const asset = assetFor(opt.kind);
    const scale = config?.height ?? 1.9;
    const brightness = Math.max(0, opt.brightness ?? 1);
    const screenX = (opt.x - opt.cameraX) * opt.blockSize + ctx.canvas.width / 2;
    const screenY = (opt.cameraY - opt.y) * opt.blockSize + ctx.canvas.height / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0, Math.min(1, opt.alpha ?? 1));
    ctx.translate(screenX, screenY);
    ctx.scale((opt.facing < 0 ? -1 : 1) * opt.blockSize, -opt.blockSize);
    if (!config || config.shape === "humanoid") renderHumanoid(ctx, asset, opt, scale, brightness);
    else renderQuadruped(ctx, asset, opt, scale, brightness, config.shape === "cow");
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
            : ["body", "head", "nose", "feet", "ear", ...(asset === "cow_cold" ? ["fur"] : [])];
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
