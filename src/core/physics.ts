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
}

/**
 * Shared AABB physics: integrates velocity with axis-separated collision
 * resolution. Mutates `body` in place. Landing (downward hit) sets `onGround`.
 */
export function moveBody(body: PhysicsBody, world: World, dt: number): void {
    const dx = body.velocityX * dt;
    body.x += dx;
    const left = body.x - body.halfWidth;
    const bottom = body.y;
    const top = bottom + body.height;
    const start = Math.floor(bottom) + 1;
    const end = Math.ceil(top);
    if (dx > 0) {
        const blockX = Math.floor(left + body.halfWidth * 2);
        if (Array.from({length: end - start + 1}, (_, i) => start + i).some((y) => world.getBlock(blockX, y))) {
            body.x = blockX - body.halfWidth - 0.001;
            body.velocityX = 0;
        }
    } else if (dx < 0) {
        const blockX = Math.floor(left);
        if (Array.from({length: end - start + 1}, (_, i) => start + i).some((y) => world.getBlock(blockX, y))) {
            body.x = blockX + 1 + body.halfWidth + 0.001;
            body.velocityX = 0;
        }
    }

    const dy = body.velocityY * dt;
    body.y += dy;
    const xl = Math.floor(body.x - body.halfWidth);
    const xr = Math.floor(body.x + body.halfWidth);
    if (dy < 0) {
        const blockY = Math.ceil(body.y);
        const hit = Array.from({length: xr - xl + 1}, (_, i) => xl + i).some((x) => world.getBlock(x, blockY));
        if (hit) {
            body.y = blockY + 0.001;
            body.velocityY = 0;
            body.onGround = true;
        } else body.onGround = false;
    } else if (dy > 0) {
        const blockY = Math.ceil(body.y + body.height);
        if (Array.from({length: xr - xl + 1}, (_, i) => xl + i).some((x) => world.getBlock(x, blockY))) {
            body.y = blockY - 1 - 0.001 - body.height;
            body.velocityY = 0;
        }
    }
}
