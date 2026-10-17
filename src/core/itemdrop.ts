import {moveBody, type PhysicsBody} from "./physics";
import type {ItemStack, SavedDroppedItem} from "./types";
import {stackLimit} from "./items";
import {WORLD_MIN_Y, type World} from "./world";
import {FLUID_FLOW_SPEED, FLUID_GRAVITY_SCALE, FLUID_MAX_FALL, WATER_ID, fluidMotionAt, fluidSurfaceAt} from "./fluid";

/** 玩家捡起掉落物的水平+竖直距离（世界坐标）。 */
export const DROP_PICKUP_RADIUS = 1.25;
/** 掉落物落地后多久内不可被捡起（秒），避免刚丢出就立即回吸。 */
const DROP_PICKUP_DELAY = 0.6;
/** 掉落物存在时间上限（秒），超时消失。 */
const DROP_LIFETIME = 300;
/** 距离玩家超过该距离的掉落物冻结物理（只计时）。 */
const DROP_UPDATE_RADIUS = 44;
/** 同 id 掉落物自动合并的距离（世界坐标）。 */
const DROP_MERGE_RADIUS = 0.7;
const DROP_GRAVITY = 24;
/** 所有方块掉落物统一使用同一个 0.5×0.5 的碰撞箱（与渲染图标尺寸一致）。 */
const DROP_HALF_WIDTH = 0.25;
const DROP_HEIGHT = 0.5;
/** 水中的浮力加速度（方块/秒²）：明显大于 `DROP_GRAVITY`，所以掉落物在水里净向上浮。 */
const DROP_BUOYANCY = 52;
/** 水中上浮的最大速度（方块/秒）：别让掉落物像炮弹一样窜出水面。 */
const DROP_FLOAT_RISE = 2.2;
/** 漂浮时底部没入液面的深度（方块）：看起来像泡在水里漂着。 */
const DROP_FLOAT_SUBMERGE = 0.15;
/** 液面稳定判定带（方块）：目标高度 ±该值内不再施加竖直力，避免上下抖动。 */
const DROP_FLOAT_BAND = 0.02;

/** 世界中的一个掉落物：受重力、与实心方块碰撞，靠近玩家时可被捡起。 */
export class DroppedItem implements PhysicsBody {
    x: number;
    y: number;
    velocityX = 0;
    velocityY = 0;
    onGround = false;
    age = 0;
    pickupDelay = DROP_PICKUP_DELAY;
    readonly halfWidth = DROP_HALF_WIDTH;
    readonly height = DROP_HEIGHT;
    readonly centerOffsetX = 0;

    get centerOffsetY(): number {
        return this.height / 2;
    }

    get centerY(): number {
        return this.y + this.height / 2;
    }

    constructor(readonly stack: ItemStack, x: number, y: number, velocityX = 0, velocityY = 0) {
        this.x = x;
        this.y = y;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
    }
}

/** Owns all dropped item entities in the world (ground items thrown with Q or overflowing /give). */
export class DroppedItemManager {
    private readonly items: DroppedItem[] = [];

    get count(): number {
        return this.items.length;
    }

    spawn(stack: ItemStack, x: number, y: number, velocityX = 0, velocityY = 0): DroppedItem | null {
        const count = Math.max(1, Math.min(stackLimit(stack.id), Math.floor(stack.count)));
        if (!Number.isFinite(count) || count <= 0) return null;
        // 工具的剩余耐久跟随掉落物（不掉耐久），否则丢出去再捡回来会变成满耐久。
        const item = new DroppedItem({id: stack.id, count, durability: stack.durability}, x, y, velocityX, velocityY);
        this.items.push(item);
        return item;
    }

    remove(item: DroppedItem): void {
        const index = this.items.indexOf(item);
        if (index >= 0) this.items.splice(index, 1);
    }

    /** 距离 (x, y) 一定范围内的掉落物，供渲染与拾取。 */
    itemsNear(x: number, y: number, radius: number): DroppedItem[] {
        const result: DroppedItem[] = [];
        for (const item of this.items) {
            if (Math.hypot(item.x - x, item.centerY - y) <= radius) result.push(item);
        }
        return result;
    }

    update(dt: number, world: World, playerX: number, playerY: number): void {
        const seconds = Math.min(dt, 0.05);
        for (let i = this.items.length - 1; i >= 0; i -= 1) {
            const item = this.items[i];
            if (item.age >= DROP_LIFETIME || item.stack.count <= 0) {
                this.items.splice(i, 1);
                continue;
            }
            item.age += seconds;
            item.pickupDelay -= seconds;
            if (Math.hypot(item.x - playerX, item.centerY - playerY) > DROP_UPDATE_RADIUS) continue;
            // 流体：水里有浮力（最终漂浮在水面上）；岩浆等其它流体保持原来的「缓慢下沉」。
            const motion = fluidMotionAt(world, item.x, item.centerY);
            const surface = fluidSurfaceAt(world, item.x, item.y);
            if (surface && surface.type === WATER_ID) {
                // 目标：底部略没入液面（泡在水里漂着），而不是沉到水底。
                const targetY = surface.surface - DROP_FLOAT_SUBMERGE;
                if (item.y < targetY - DROP_FLOAT_BAND) {
                    // 还在水面以下：入水时先限制下沉速度，再按浮力加速上浮。
                    item.velocityY = Math.max(item.velocityY, -FLUID_MAX_FALL);
                    item.velocityY = Math.min(DROP_FLOAT_RISE, item.velocityY + DROP_BUOYANCY * seconds);
                } else if (item.y > targetY + DROP_FLOAT_BAND) {
                    // 被抛出水面之上：正常重力把它带回水面，再由上面的分支停住。
                    item.velocityY -= DROP_GRAVITY * seconds;
                } else {
                    // 已经漂在液面：不再施加竖直力（否则会在水面上下抖）。
                    item.velocityY = 0;
                }
                item.velocityX += surface.flowX * FLUID_FLOW_SPEED * seconds;
            } else if (motion.inFluid) {
                item.velocityY -= DROP_GRAVITY * FLUID_GRAVITY_SCALE * seconds;
                item.velocityY = Math.max(item.velocityY, -FLUID_MAX_FALL);
                item.velocityX += motion.flowX * FLUID_FLOW_SPEED * seconds;
            } else {
                item.velocityY -= DROP_GRAVITY * seconds;
            }
            if (item.onGround) {
                // 落地后轻微摩擦，避免永远滑动。
                item.velocityX -= item.velocityX * Math.min(1, seconds * 10);
                if (Math.abs(item.velocityX) < 0.05) item.velocityX = 0;
            }
            moveBody(item, world, seconds);
            if (item.y < WORLD_MIN_Y - 4) item.age = DROP_LIFETIME;
        }
        this.mergeNear(playerX, playerY);
    }

    /** 同 id 且距离足够近的掉落物合并为一个堆叠（只处理玩家附近，保证性能）。 */
    private mergeNear(playerX: number, playerY: number): void {
        const near = this.items.filter((item) => Math.hypot(item.x - playerX, item.centerY - playerY) <= DROP_UPDATE_RADIUS);
        for (let i = 0; i < near.length; i += 1) {
            const a = near[i];
            if (!this.items.includes(a)) continue;
            for (let j = i + 1; j < near.length; j += 1) {
                const b = near[j];
                if (!this.items.includes(b)) continue;
                if (a.stack.id !== b.stack.id) continue;
                // 不可堆叠的物品（工具，stackLimit = 1）不合并：各自是一个独立掉落物。
                const limit = stackLimit(a.stack.id);
                if (limit <= 1) continue;
                if (Math.hypot(a.x - b.x, a.centerY - b.centerY) > DROP_MERGE_RADIUS) continue;
                const total = a.stack.count + b.stack.count;
                if (total <= limit) {
                    a.stack.count = total;
                    this.remove(b);
                } else {
                    a.stack.count = limit;
                    b.stack.count = total - limit;
                }
            }
        }
    }

    /** 移除全部掉落物（用于 /kill items），返回移除数量。 */
    clear(): number {
        const count = this.items.length;
        this.items.length = 0;
        return count;
    }

    serialize(): SavedDroppedItem[] {
        return this.items.map((item) => ({
            id: item.stack.id,
            count: item.stack.count,
            durability: item.stack.durability,
            x: item.x,
            y: item.y,
            velocityX: item.velocityX,
            velocityY: item.velocityY,
        }));
    }

    restore(saved: SavedDroppedItem[] | undefined): void {
        if (!Array.isArray(saved)) return;
        for (const data of saved) {
            if (!data || typeof data.id !== "string") continue;
            const count = Number.isFinite(data.count) ? Math.max(1, Math.min(stackLimit(data.id), Math.floor(data.count))) : 1;
            const x = Number.isFinite(data.x) ? data.x : 0;
            const y = Number.isFinite(data.y) ? data.y : 0;
            this.spawn(
                {id: data.id, count, durability: Number.isFinite(data.durability) ? data.durability : undefined},
                x,
                y,
                Number.isFinite(data.velocityX) ? data.velocityX : 0,
                Number.isFinite(data.velocityY) ? data.velocityY : 0,
            );
        }
    }
}