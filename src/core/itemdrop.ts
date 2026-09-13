import {moveBody, type PhysicsBody} from "./physics";
import {MAX_STACK_SIZE, type ItemStack, type SavedDroppedItem} from "./types";
import {WORLD_MIN_Y, type World} from "./world";

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
const DROP_HALF_WIDTH = 0.16;
const DROP_HEIGHT = 0.28;

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
        const count = Math.max(1, Math.min(MAX_STACK_SIZE, Math.floor(stack.count)));
        if (!Number.isFinite(count) || count <= 0) return null;
        const item = new DroppedItem({id: stack.id, count}, x, y, velocityX, velocityY);
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
            item.velocityY -= DROP_GRAVITY * seconds;
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
                if (Math.hypot(a.x - b.x, a.centerY - b.centerY) > DROP_MERGE_RADIUS) continue;
                const total = a.stack.count + b.stack.count;
                if (total <= MAX_STACK_SIZE) {
                    a.stack.count = total;
                    this.remove(b);
                } else {
                    a.stack.count = MAX_STACK_SIZE;
                    b.stack.count = total - MAX_STACK_SIZE;
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
            const count = Number.isFinite(data.count) ? Math.max(1, Math.min(MAX_STACK_SIZE, Math.floor(data.count))) : 1;
            const x = Number.isFinite(data.x) ? data.x : 0;
            const y = Number.isFinite(data.y) ? data.y : 0;
            this.spawn(
                {id: data.id, count},
                x,
                y,
                Number.isFinite(data.velocityX) ? data.velocityX : 0,
                Number.isFinite(data.velocityY) ? data.velocityY : 0,
            );
        }
    }
}