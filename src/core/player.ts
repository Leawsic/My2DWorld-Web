import {World} from "./world";
import type {MovementSettings} from "./types";

export const BODY_HALF_WIDTH = 0.25;
export const BODY_HEIGHT = 1.9;
const MAX_JUMPS = 2;
const DOUBLE_SPACE_WINDOW = 0.35;

export interface KeyState {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    jump: boolean;
}

export class Player {
    x: number;
    y: number;
    velocityX = 0;
    velocityY = 0;
    onGround = false;
    jumpsUsed = 0;
    flying = false;
    health = 20;
    facing = 1;
    private jumpWasDown = false;
    private doubleSpaceTimer = 0;
    private animationTime = 0;

    constructor(x: number, y: number, readonly movement: MovementSettings) {
        this.x = x;
        this.y = y;
    }

    update(keys: KeyState, dt: number, world: World): void {
        const seconds = Math.min(dt, 0.05);
        const pressed = keys.jump && !this.jumpWasDown;
        this.doubleSpaceTimer = Math.max(0, this.doubleSpaceTimer - seconds);
        if (pressed) {
            if (this.doubleSpaceTimer > 0) {
                this.flying = !this.flying;
                this.velocityY = 0;
                this.jumpsUsed = 0;
            }
            this.doubleSpaceTimer = DOUBLE_SPACE_WINDOW;
        }
        this.jumpWasDown = keys.jump;

        this.velocityX = keys.left === keys.right ? 0 : keys.left ? -this.movement.walkSpeed : this.movement.walkSpeed;
        if (this.velocityX) this.facing = Math.sign(this.velocityX);
        if (this.flying) {
            this.velocityY = keys.up === keys.down ? 0 : keys.up ? this.movement.flySpeed : -this.movement.flySpeed;
        } else {
            if (pressed && this.jumpsUsed < MAX_JUMPS) {
                this.velocityY = this.movement.jumpVelocity;
                this.jumpsUsed += 1;
                this.onGround = false;
            }
            this.velocityY -= this.movement.gravity * seconds;
        }
        this.moveX(world, seconds);
        this.moveY(world, seconds);
        this.animationTime = this.velocityX ? this.animationTime + seconds : 0;
    }

    reset(x: number, y: number): void {
        this.x = x;
        this.y = y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.onGround = false;
        this.jumpsUsed = 0;
        this.flying = false;
        this.health = 20;
    }

    animationFrame(): number {
        return this.velocityX ? Math.floor(this.animationTime * 10) % 4 : 0;
    }

    private moveX(world: World, dt: number): void {
        const dx = this.velocityX * dt;
        this.x += dx;
        const left = this.x - BODY_HALF_WIDTH;
        const bottom = this.y;
        const top = bottom + BODY_HEIGHT;
        const start = Math.floor(bottom) + 1;
        const end = Math.ceil(top);
        if (dx > 0) {
            const blockX = Math.floor(left + BODY_HALF_WIDTH * 2);
            if (Array.from({length: end - start + 1}, (_, i) => start + i).some((y) => world.getBlock(blockX, y))) {
                this.x = blockX - BODY_HALF_WIDTH - 0.001;
                this.velocityX = 0;
            }
        } else if (dx < 0) {
            const blockX = Math.floor(left);
            if (Array.from({length: end - start + 1}, (_, i) => start + i).some((y) => world.getBlock(blockX, y))) {
                this.x = blockX + 1 + BODY_HALF_WIDTH + 0.001;
                this.velocityX = 0;
            }
        }
    }

    private moveY(world: World, dt: number): void {
        const dy = this.velocityY * dt;
        this.y += dy;
        const left = Math.floor(this.x - BODY_HALF_WIDTH);
        const right = Math.floor(this.x + BODY_HALF_WIDTH);
        const height = BODY_HEIGHT;
        if (dy < 0) {
            const blockY = Math.ceil(this.y);
            const hit = Array.from({length: right - left + 1}, (_, i) => left + i).some((x) => world.getBlock(x, blockY));
            if (hit) {
                this.y = blockY + 0.001;
                this.velocityY = 0;
                this.onGround = true;
                this.jumpsUsed = 0;
            } else this.onGround = false;
        } else if (dy > 0) {
            const blockY = Math.ceil(this.y + height);
            if (Array.from({length: right - left + 1}, (_, i) => left + i).some((x) => world.getBlock(x, blockY))) {
                this.y = blockY - 1 - 0.001 - height;
                this.velocityY = 0;
            }
        }
    }
}
