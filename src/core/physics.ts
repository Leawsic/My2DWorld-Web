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
 * Shared AABB physics: integrates velocity with axis-separated collision
 * resolution. Mutates `body` in place. Landing (downward hit) sets `onGround`.
 * The collision box is the hitbox box (center = (x,y)+offset, half-width/height
 * from the config), so physics, combat checks and the F5 overlay share one box.
 */
export function moveBody(body: PhysicsBody, world: World, dt: number): void {
    const cx = body.centerOffsetX ?? 0;
    const cy = body.centerOffsetY ?? 0;
    const left = () => body.x + cx - body.halfWidth;
    const right = () => body.x + cx + body.halfWidth;
    const bottom = () => body.y + cy - body.height / 2;
    const top = () => body.y + cy + body.height / 2;

    const dx = body.velocityX * dt;
    body.x += dx;
    const start = Math.floor(bottom()) + 1;
    const end = Math.ceil(top());
    const sweepY = (fn: (y: number) => boolean): boolean => {
        for (let y = start; y <= end; y += 1) if (fn(y)) return true;
        return false;
    };
    if (dx > 0) {
        const blockX = Math.floor(right());
        if (sweepY((y) => world.isSolid(blockX, y))) {
            body.x = blockX - cx - body.halfWidth - 0.001;
            body.velocityX = 0;
        }
    } else if (dx < 0) {
        const blockX = Math.floor(left());
        if (sweepY((y) => world.isSolid(blockX, y))) {
            body.x = blockX + 1 - cx + body.halfWidth + 0.001;
            body.velocityX = 0;
        }
    }

    const dy = body.velocityY * dt;
    body.y += dy;
    const xl = Math.floor(left());
    const xr = Math.floor(right());
    const sweepX = (fn: (x: number) => boolean): boolean => {
        for (let x = xl; x <= xr; x += 1) if (fn(x)) return true;
        return false;
    };
    if (dy < 0) {
        const blockY = Math.ceil(bottom());
        if (sweepX((x) => world.isSolid(x, blockY))) {
            body.y = blockY + 0.001 - cy + body.height / 2;
            body.velocityY = 0;
            body.onGround = true;
        } else body.onGround = false;
    } else if (dy > 0) {
        const blockY = Math.ceil(top());
        if (sweepX((x) => world.isSolid(x, blockY))) {
            body.y = blockY - 1 - 0.001 - cy - body.height / 2;
            body.velocityY = 0;
        }
    }
}
