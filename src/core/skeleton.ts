import type {MobKind} from "./entity";

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

type Part = "head" | "torso" | "armL" | "armR" | "legL" | "legR";

const PART_SIZES: Record<Part, readonly [number, number]> = {
    head: [16, 16],
    torso: [8, 24],
    armL: [8, 24],
    armR: [8, 24],
    legL: [8, 24],
    legR: [8, 24],
};

const images = new Map<string, HTMLImageElement>();

function imageFor(kind: CharacterKind, part: Part): HTMLImageElement {
    const key = `${kind}/${part}`;
    let image = images.get(key);
    if (!image) {
        image = new Image();
        image.src = `/assets/skeleton/${kind}/${part}.png`;
        images.set(key, image);
    }
    return image;
}

function triangleWave(time: number): number {
    const phase = ((time % 1) + 1) % 1;
    return phase <= 0.5 ? phase * 2 : 2 - phase * 2;
}

function drawPart(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, part: Part, pivotY: number, angle: number, brightness: number, tint?: string, tintAmount = 0): void {
    if (!image.complete || !image.naturalWidth) return;
    const [width, height] = PART_SIZES[part];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1); // Part PNGs use the .myanim local y-down coordinate system.
    ctx.rotate(angle);
    ctx.drawImage(image, -width / 2, -pivotY * height, width, height);
    if (brightness < 1) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = 1 - Math.max(0, brightness);
        ctx.fillStyle = "#000";
        ctx.fillRect(-width / 2, -pivotY * height, width, height);
    }
    if (tint && tintAmount > 0) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = Math.max(0, Math.min(1, tintAmount));
        ctx.fillStyle = tint;
        ctx.fillRect(-width / 2, -pivotY * height, width, height);
    }
    ctx.restore();
}

/** Draws source .myanim parts in game-world coordinates (feet at x/y). */
export function renderCharacter(ctx: CanvasRenderingContext2D, opt: CharacterRenderOptions): void {
    const brightness = Math.max(0, opt.brightness ?? 1);
    const walking = opt.pose === "walk";
    const attacking = opt.pose === "attack";
    const u = triangleWave(opt.time);
    const degree = Math.PI / 180;
    const player = opt.kind === "player";
    const legL = walking ? (-25 + 50 * u) * degree : 0;
    const legR = walking ? (25 - 50 * u) * degree : 0;
    const attackPhase = (opt.time % 0.75 + 0.75) % 0.75;
    const attackAngle = attackPhase < 0.5
        ? (-90 - 90 * (attackPhase / 0.5)) * degree
        : (-180 + 90 * ((attackPhase - 0.5) / 0.25)) * degree;
    const armL = attacking ? attackAngle : player ? (walking ? (30 - 60 * u) * degree : 0) : -90 * degree;
    const armR = attacking ? attackAngle : player ? (walking ? (-30 + 60 * u) * degree : 0) : -90 * degree;
    const screenX = (opt.x - opt.cameraX) * opt.blockSize + ctx.canvas.width / 2;
    const screenY = (opt.cameraY - opt.y) * opt.blockSize + ctx.canvas.height / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0, Math.min(1, opt.alpha ?? 1));
    ctx.translate(screenX, screenY);
    ctx.scale((opt.facing < 0 ? -1 : 1) * opt.blockSize * (1.9 / 64), -opt.blockSize * (1.9 / 64));

    // Coordinates/pivots/layers match the supplied humanoid .myanim files.
    drawPart(ctx, imageFor(opt.kind, "armL"), 0, 44, "armL", 0.1667, armL, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, imageFor(opt.kind, "legL"), 0, 24, "legL", 0, legL, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, imageFor(opt.kind, "torso"), 0, 36, "torso", 0.5, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, imageFor(opt.kind, "head"), 0, 48, "head", 1, 0, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, imageFor(opt.kind, "legR"), 0, 24, "legR", 0, legR, brightness, opt.tint, opt.tintAmount);
    drawPart(ctx, imageFor(opt.kind, "armR"), 0, 44, "armR", 0.1667, armR, brightness, opt.tint, opt.tintAmount);
    ctx.restore();
}
