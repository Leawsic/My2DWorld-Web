import type {World} from "./world";

/** Minimal axis-aligned box needed for shared body physics. */
export interface PhysicsBody {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    onGround: boolean;
    readonly halfWidth: number;
    readonly height: number;
    /** 碰撞箱中心相对锚点 (x, y) 的水平偏移（方块）。 */
    readonly centerOffsetX?: number;
    /** 碰撞箱中心相对锚点 (x, y) 的竖直偏移（方块）。 */
    readonly centerOffsetY?: number;
}

/**
 * 扫掠（swept）碰撞的单步子步长。任何一步的位移都小于 1 个方块，
 * 因此高速移动（大速度 × dt）时碰撞箱的前沿不可能一步跨过整格墙 —— 防穿墙。
 */
const MAX_SUBSTEP = 0.5;

/**
 * Shared AABB physics: integrates velocity with axis-separated collision
 * resolution. Mutates `body` in place. Landing (downward hit) sets `onGround`.
 * The collision box is the hitbox box (center = (x,y)+offset, half-width/height
 * from the config), so physics, combat checks and the F5 overlay share one box.
 *
 * 位移按 MAX_SUBSTEP 拆分后逐子步解析：极快速度（如调大移动速度/飞行速度）
 * 或低帧率下也不会穿过 1 格厚的墙。
 */
export function moveBody(body: PhysicsBody, world: World, dt: number): void {
    const cx = body.centerOffsetX ?? 0;
    const cy = body.centerOffsetY ?? 0;
    const left = () => body.x + cx - body.halfWidth;
    const right = () => body.x + cx + body.halfWidth;
    const bottom = () => body.y + cy - body.height / 2;
    const top = () => body.y + cy + body.height / 2;

    const dx = body.velocityX * dt;
    const stepsX = Math.max(1, Math.ceil(Math.abs(dx) / MAX_SUBSTEP));
    const stepX = dx / stepsX;
    for (let s = 0; s < stepsX; s += 1) {
        body.x += stepX;
        const start = Math.floor(bottom()) + 1;
        const end = Math.ceil(top());
        if (stepX > 0) {
            const blockX = Math.floor(right());
            let hit = false;
            for (let y = start; y <= end; y += 1) {
                if (world.isSolid(blockX, y)) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                body.x = blockX - cx - body.halfWidth - 0.001;
                body.velocityX = 0;
                break;
            }
        } else if (stepX < 0) {
            const blockX = Math.floor(left());
            let hit = false;
            for (let y = start; y <= end; y += 1) {
                if (world.isSolid(blockX, y)) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                body.x = blockX + 1 - cx + body.halfWidth + 0.001;
                body.velocityX = 0;
                break;
            }
        }
    }

    const dy = body.velocityY * dt;
    const stepsY = Math.max(1, Math.ceil(Math.abs(dy) / MAX_SUBSTEP));
    const stepY = dy / stepsY;
    if (dy < 0) {
        let landed = false;
        for (let s = 0; s < stepsY; s += 1) {
            body.y += stepY;
            const xl = Math.floor(left());
            const xr = Math.floor(right());
            const blockY = Math.ceil(bottom());
            let hit = false;
            for (let x = xl; x <= xr; x += 1) {
                if (world.isSolid(x, blockY)) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                body.y = blockY + 0.001 - cy + body.height / 2;
                body.velocityY = 0;
                landed = true;
                break;
            }
        }
        body.onGround = landed;
    } else if (dy > 0) {
        for (let s = 0; s < stepsY; s += 1) {
            body.y += stepY;
            const xl = Math.floor(left());
            const xr = Math.floor(right());
            const blockY = Math.ceil(top());
            let hit = false;
            for (let x = xl; x <= xr; x += 1) {
                if (world.isSolid(x, blockY)) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                body.y = blockY - 1 - 0.001 - cy - body.height / 2;
                body.velocityY = 0;
                break;
            }
        }
    }
}

/** 水平平移 dx 后碰撞箱是否不与实心方块重叠（实体互推/挤压墙角判定时防止挤进墙里）。 */
export function canShiftX(body: PhysicsBody, dx: number, world: World): boolean {
    const cx = body.x + (body.centerOffsetX ?? 0) + dx;
    const blockX = dx > 0 ? Math.floor(cx + body.halfWidth) : Math.floor(cx - body.halfWidth);
    const bottom = Math.floor(body.y + (body.centerOffsetY ?? 0) - body.height / 2) + 1;
    const top = Math.ceil(body.y + (body.centerOffsetY ?? 0) + body.height / 2);
    for (let y = bottom; y <= top; y += 1) {
        if (world.isSolid(blockX, y)) return false;
    }
    return true;
}

/** 竖直平移 dy 后碰撞箱是否不与实心方块重叠。 */
export function canShiftY(body: PhysicsBody, dy: number, world: World): boolean {
    const cy = body.y + (body.centerOffsetY ?? 0) + dy;
    const blockY = dy > 0 ? Math.ceil(cy + body.height / 2) : Math.ceil(cy - body.height / 2);
    const xl = Math.floor(body.x + (body.centerOffsetX ?? 0) - body.halfWidth);
    const xr = Math.floor(body.x + (body.centerOffsetX ?? 0) + body.halfWidth);
    for (let x = xl; x <= xr; x += 1) {
        if (world.isSolid(x, blockY)) return false;
    }
    return true;
}

/**
 * 实体间 AABB 弹性碰撞：沿最小穿透轴按质量加权把两者完全推开（若一方被墙/地面
 * 挡住，则由另一方承受全部位移），并沿法线施加恢复系数（restitution）的反弹速度。
 * 推开后留 0.001 的间隙，避免下一帧立即重新重叠造成闪烁。
 * massA/massB 为等效质量（越大越难被推动；用极大值表示「不可推动」）。
 * 返回是否发生了位置分离。
 */
export function resolveEntityCollision(
    a: PhysicsBody,
    b: PhysicsBody,
    massA: number,
    massB: number,
    world: World,
    restitution: number,
): boolean {
    const ax = a.x + (a.centerOffsetX ?? 0), ay = a.y + (a.centerOffsetY ?? 0);
    const bx = b.x + (b.centerOffsetX ?? 0), by = b.y + (b.centerOffsetY ?? 0);
    const dx = bx - ax, dy = by - ay;
    const penX = a.halfWidth + b.halfWidth - Math.abs(dx);
    const penY = (a.height + b.height) / 2 - Math.abs(dy);
    if (penX <= 0 || penY <= 0) return false;

    const gap = 0.001;
    const total = massA + massB;
    const dirX = dx >= 0 ? 1 : -1;
    const dirY = dy >= 0 ? 1 : -1;

    /** 双体冲量：两者都能动时按质量交换速度（含恢复系数）。 */
    const impulse = (axis: "x" | "y", dir: number): void => {
        const rel = axis === "x" ? b.velocityX - a.velocityX : b.velocityY - a.velocityY;
        if (rel * dir >= 0) return; // 未在接近，无需反弹
        const j = (-(1 + restitution) * rel) / (1 / massA + 1 / massB);
        if (axis === "x") {
            a.velocityX -= (j / massA) * dir;
            b.velocityX += (j / massB) * dir;
        } else {
            a.velocityY -= (j / massA) * dir;
            b.velocityY += (j / massB) * dir;
        }
    };

    /** 单体反弹：对方不可动（如落地、贴墙），本体按恢复系数弹回。 */
    const reflect = (body: PhysicsBody, axis: "x" | "y", dir: number): void => {
        const v = axis === "x" ? body.velocityX : body.velocityY;
        const approach = v * dir; // < 0 表示正朝对方移动
        if (approach >= 0) return;
        const nv = v - (1 + restitution) * approach * dir;
        if (axis === "x") body.velocityX = nv;
        else body.velocityY = nv;
    };

    const resolve = (axis: "x" | "y"): boolean => {
        const pen = (axis === "x" ? penX : penY) + gap;
        const dir = axis === "x" ? dirX : dirY;
        const pushA = pen * (massB / total);
        const aShift = -dir * pushA;
        const bShift = dir * (pen - pushA);
        const aCan = axis === "x" ? canShiftX(a, aShift, world) : canShiftY(a, aShift, world);
        const bCan = axis === "x" ? canShiftX(b, bShift, world) : canShiftY(b, bShift, world);
        if (aCan && bCan) {
            if (axis === "x") {
                a.x += aShift;
                b.x += bShift;
            } else {
                a.y += aShift;
                b.y += bShift;
            }
            impulse(axis, dir);
        } else if (aCan) {
            if (axis === "x") a.x -= dir * pen;
            else a.y -= dir * pen;
            reflect(a, axis, dir);
        } else if (bCan) {
            if (axis === "x") b.x += dir * pen;
            else b.y += dir * pen;
            reflect(b, axis, dir);
        } else {
            return false;
        }
        return true;
    };

    if (resolve(penX <= penY ? "x" : "y")) return true;
    return resolve(penX <= penY ? "y" : "x");
}
