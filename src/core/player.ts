import {World} from "./world";
import type {MovementSettings} from "./types";
import {moveBody, type PhysicsBody} from "./physics";
import {FLUID_FLOW_SPEED, FLUID_GRAVITY_SCALE, FLUID_MAX_FALL, FLUID_RISE_SPEED, fluidOverlap, isFluid} from "./fluid";

export const BODY_HALF_WIDTH = 0.25;
export const BODY_HEIGHT = 1.9;
/** 玩家挤压箱（物理挤压判定用）：比身体碰撞箱小一圈（半宽 -0.1、高度 -0.1，中心不变）。
 *  与生物的挤压箱约定一致：挤压箱 = 碰撞箱缩小一圈，挤压伤害严格按挤压箱结算。 */
export const PLAYER_SQUEEZE_HALF_WIDTH = BODY_HALF_WIDTH - 0.1;
export const PLAYER_SQUEEZE_HEIGHT = BODY_HEIGHT - 0.1;
const MAX_JUMPS = 2;
const DOUBLE_SPACE_WINDOW = 0.35;
/** 脚下找水面的扫描格数（含脚底那一格）：浮出水面后水面最多在脚下 1~2 格。 */
const WATER_SURFACE_SCAN = 3;

/**
 * 玩家所在列「脚下水柱」的液面高度（该列这一串水最上面那一格的顶面 y）。
 * 从脚底那一格向下最多找 WATER_SURFACE_SCAN 格：身体沉在水里时脚底格就是水，
 * 浮出水面时水面就在脚下 1~2 格。该列脚下没有水（例如站在岸上）返回 null。
 */
function waterSurfaceUnder(world: World, x: number, feetY: number): number | null {
    const column = Math.floor(x);
    const top = Math.floor(feetY);
    for (let y = top; y > top - WATER_SURFACE_SCAN; y -= 1) {
        const id = world.getBlockId(column, y);
        if (id !== null && isFluid(id)) return y;
    }
    return null;
}

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
    /** 是否允许飞行（生存模式禁止：无法双击开飞，夹紧停在陆地上）。 */
    allowFlying = true;
    health = 20;
    facing = 1;
    /** 缓慢效果剩余时间（秒）：>0 时移动/飞行速度 -20%（亡灵生物挤压附带）。 */
    slowTimer = 0;
    /** 幽灵标志：旁观模式 / 灵魂出窍时实体不吸引仇恨、不受伤、不被物理挤压。 */
    ghost = false;
    /** 无碰撞：随 ghost 同步（旁观/灵魂出窍时无物理碰撞箱，直接穿越方块）。 */
    get noclip(): boolean {
        return this.ghost;
    }
    /** 是否允许在水里/水面处起跳（生存模式禁止：水面不是跳板，只能靠浮力上浮后再起跳）。 */
    waterJump = true;
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
        if (!this.allowFlying) this.flying = false;
        const pressed = keys.jump && !this.jumpWasDown;
        this.doubleSpaceTimer = Math.max(0, this.doubleSpaceTimer - seconds);
        if (pressed) {
            if (this.doubleSpaceTimer > 0 && this.allowFlying) {
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
            // 水体/岩浆浮力与流动推力（幽灵无碰撞，不受流体影响）。
            const fluid = this.ghost ? null : fluidOverlap(world, this.halfWidth, this.height, this.x, this.y);
            if (fluid && fluid.submerged) {
                // 按住跳跃（空格）上浮；否则重力大幅降低（浮力：降低下落速度），并受水平流力推动。
                if (keys.jump) {
                    this.velocityY = FLUID_RISE_SPEED;
                } else {
                    this.velocityY -= this.movement.gravity * FLUID_GRAVITY_SCALE * seconds;
                    this.velocityY = Math.max(this.velocityY, -FLUID_MAX_FALL);
                }
                this.velocityX += fluid.flowX * FLUID_FLOW_SPEED;
                this.jumpsUsed = 0;
            } else {
                // 生存模式（waterJump=false）：脚底已经在水面或水面以下时不能起跳——水面不是跳板。
                // 玩家可以先靠浮力浮出水面（此时脚底高于液面），再正常起跳离开水面。
                const surface = this.waterJump || this.ghost ? null : waterSurfaceUnder(world, this.x, this.y);
                const atWaterSurface = surface !== null && this.y <= surface;
                if (pressed && !atWaterSurface && this.jumpsUsed < MAX_JUMPS) {
                    this.velocityY = this.movement.jumpVelocity;
                    this.jumpsUsed += 1;
                    this.onGround = false;
                }
                this.velocityY -= this.movement.gravity * seconds;
            }
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
