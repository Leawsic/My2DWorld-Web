import {World} from "./world";
import type {MovementSettings} from "./types";
import {moveBody, type PhysicsBody} from "./physics";

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
    sneak: boolean;
}

export class Player implements PhysicsBody {
    x: number;
    y: number;
    velocityX = 0;
    velocityY = 0;
    onGround = false;
    readonly halfWidth = BODY_HALF_WIDTH;
    readonly height = BODY_HEIGHT;
    readonly centerOffsetX = 0;
    readonly centerOffsetY = BODY_HEIGHT / 2;
    jumpsUsed = 0;
    flying = false;
    health = 20;
    facing = 1;
    /** 缓慢效果剩余时间（秒）：>0 时移动/飞行速度 -20%（亡灵生物挤压附带）。 */
    slowTimer = 0;
    private jumpWasDown = false;
    private doubleSpaceTimer = 0;
    private animationTime = 0;

    constructor(x: number, y: number, readonly movement: MovementSettings) {
        this.x = x;
        this.y = y;
    }

    update(keys: KeyState, dt: number, world: World): void {
        const seconds = Math.min(dt, 0.05);
        this.slowTimer = Math.max(0, this.slowTimer - seconds);
        const slow = this.slowTimer > 0 ? 0.8 : 1;
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

        this.velocityX = keys.left === keys.right ? 0 : keys.left ? -this.movement.walkSpeed * slow : this.movement.walkSpeed * slow;
        if (this.velocityX) this.facing = Math.sign(this.velocityX);
        if (this.flying) {
            const up = keys.up || keys.jump;
            const down = keys.down || keys.sneak;
            this.velocityY = up === down ? 0 : up ? this.movement.flySpeed * slow : -this.movement.flySpeed * slow;
        } else {
            if (pressed && this.jumpsUsed < MAX_JUMPS) {
                this.velocityY = this.movement.jumpVelocity;
                this.jumpsUsed += 1;
                this.onGround = false;
            }
            this.velocityY -= this.movement.gravity * seconds;
        }
        const wasOnGround = this.onGround;
        moveBody(this, world, seconds);
        if (!wasOnGround && this.onGround) this.jumpsUsed = 0;
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
        this.slowTimer = 0;
    }

    get animationT(): number {
        return this.animationTime;
    }

    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }

    setFlying(flying: boolean): void {
        this.flying = flying;
        this.velocityY = 0;
        this.jumpsUsed = 0;
    }
}
