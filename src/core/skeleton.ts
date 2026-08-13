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

interface Palette {
    skin: string;
    torso: string;
    legs: string;
}

const PALETTES: Record<CharacterKind, Palette> = {
    player: {skin: "#d9a06b", torso: "#52a8d9", legs: "#4b6cae"},
    zombie: {skin: "#5d9b55", torso: "#4b7898", legs: "#4f5794"},
    husk: {skin: "#b59a63", torso: "#777f61", legs: "#4e5c54"},
    drowned: {skin: "#4e9294", torso: "#506d75", legs: "#3c5963"},
};

function blend(a: string, b: string, amount: number): string {
    const n = Math.max(0, Math.min(1, amount));
    const av = Number.parseInt(a.slice(1), 16);
    const bv = Number.parseInt(b.slice(1), 16);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return a;
    const r = Math.round(((av >> 16) & 255) * (1 - n) + ((bv >> 16) & 255) * n);
    const g = Math.round(((av >> 8) & 255) * (1 - n) + ((bv >> 8) & 255) * n);
    const blue = Math.round((av & 255) * (1 - n) + (bv & 255) * n);
    return `#${((r << 16) | (g << 8) | blue).toString(16).padStart(6, "0")}`;
}

function shade(color: string, brightness: number, tint?: string, tintAmount = 0): string {
    const value = Number.parseInt(color.slice(1), 16);
    if (!Number.isFinite(value)) return color;
    const r = Math.round(Math.min(255, ((value >> 16) & 255) * brightness));
    const g = Math.round(Math.min(255, ((value >> 8) & 255) * brightness));
    const b = Math.round(Math.min(255, (value & 255) * brightness));
    const lit = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    return tint ? blend(lit, tint, tintAmount) : lit;
}

function drawPart(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, angle: number, color: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.fillRect(-width / 2, -height, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 1 / 32;
    ctx.strokeRect(-width / 2, -height, width, height);
    ctx.restore();
}

/** Draws a simple hierarchical humanoid in game-world coordinates (feet at x/y). */
export function renderCharacter(ctx: CanvasRenderingContext2D, opt: CharacterRenderOptions): void {
    const palette = PALETTES[opt.kind];
    const brightness = Math.max(0, opt.brightness ?? 1);
    const color = (base: string) => shade(base, brightness, opt.tint, opt.tintAmount);
    const walking = opt.pose === "walk";
    const attacking = opt.pose === "attack";
    const swing = walking ? Math.sin(opt.time * Math.PI * 2) : 0;
    const legAngle = swing * 0.42;
    const armAngle = attacking ? Math.PI / 2 : -swing * 0.5;
    const otherArmAngle = attacking ? Math.PI / 2 : swing * 0.5;
    const screenX = (opt.x - opt.cameraX) * opt.blockSize + ctx.canvas.width / 2;
    const screenY = (opt.cameraY - opt.y) * opt.blockSize + ctx.canvas.height / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0, Math.min(1, opt.alpha ?? 1));
    ctx.translate(screenX, screenY);
    ctx.scale((opt.facing < 0 ? -1 : 1) * opt.blockSize, -opt.blockSize);

    // Back limbs first, then torso/head, then the near limbs.
    drawPart(ctx, -0.12, 0.68, 0.22, 0.68, legAngle, color(palette.legs));
    drawPart(ctx, 0, 1.22, 0.22, 0.62, otherArmAngle, color(palette.skin));
    ctx.fillStyle = color(palette.torso);
    ctx.fillRect(-0.28, 0.65, 0.56, 0.64);
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 1 / 32;
    ctx.strokeRect(-0.28, 0.65, 0.56, 0.64);
    ctx.fillStyle = color(palette.skin);
    ctx.fillRect(-0.27, 1.29, 0.54, 0.51);
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.strokeRect(-0.27, 1.29, 0.54, 0.51);
    drawPart(ctx, 0.12, 0.68, 0.22, 0.68, -legAngle, color(palette.legs));
    drawPart(ctx, 0, 1.22, 0.22, 0.62, armAngle, color(palette.skin));
    ctx.restore();
}

export function characterColor(kind: CharacterKind): string {
    return PALETTES[kind].torso;
}
