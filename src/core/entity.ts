import {biomeAt, CHUNK_SIZE, WORLD_MIN_Y, type World} from "./world";
import type {Player} from "./player";
import {moveBody, type PhysicsBody} from "./physics";
import {mulberry32} from "./noise";
import {structuresNear} from "./structures";
import {hitboxFor} from "./hitboxes";

export type MobKind =
    | "zombie" | "zombie_baby" | "husk" | "husk_baby" | "drowned" | "drowned_baby"
    | "pig_cold" | "pig_cold_baby" | "pig_temperate" | "pig_temperate_baby" | "pig_warm" | "pig_warm_baby"
    | "cow_cold" | "cow_temperate" | "cow_warm" | "mooshroom_red" | "mooshroom_brown";
export type MobState = "idle" | "walk" | "attack";
export type MobShape = "humanoid" | "pig" | "cow";

export interface MobKindConfig {
    readonly id: MobKind;
    readonly asset: MobKind;
    readonly shape: MobShape;
    readonly hostile: boolean;
    readonly scale: number;
    readonly halfWidth: number;
    readonly height: number;
    readonly speed: number;
    readonly jumpVelocity: number;
    readonly hp: number;
    readonly damage: number;
    readonly attackCooldown: number;
    readonly hitRange: number;
    /** Rendered sprite size in blocks (art is wider than the 0.5-block hitbox). */
    readonly visual: {width: number; height: number};
}

export const MOB_KINDS: Record<MobKind, MobKindConfig> = {
    zombie: {id: "zombie", asset: "zombie", shape: "humanoid", hostile: true, scale: 1, halfWidth: 0.4, height: 1.85, speed: 1.6, jumpVelocity: 8, hp: 20, damage: 3, attackCooldown: 0.8, hitRange: 1.2, visual: {width: 1.9, height: 1.85}},
    zombie_baby: {id: "zombie_baby", asset: "zombie_baby", shape: "humanoid", hostile: true, scale: 0.5, halfWidth: 0.25, height: 0.925, speed: 2.1, jumpVelocity: 7, hp: 10, damage: 2, attackCooldown: 0.65, hitRange: 0.9, visual: {width: 0.95, height: 0.925}},
    husk: {id: "husk", asset: "husk", shape: "humanoid", hostile: true, scale: 1, halfWidth: 0.4, height: 1.85, speed: 1.6, jumpVelocity: 8, hp: 20, damage: 3, attackCooldown: 0.8, hitRange: 1.2, visual: {width: 1.9, height: 1.85}},
    husk_baby: {id: "husk_baby", asset: "husk_baby", shape: "humanoid", hostile: true, scale: 0.5, halfWidth: 0.25, height: 0.925, speed: 2.1, jumpVelocity: 7, hp: 10, damage: 2, attackCooldown: 0.65, hitRange: 0.9, visual: {width: 0.95, height: 0.925}},
    drowned: {id: "drowned", asset: "drowned", shape: "humanoid", hostile: true, scale: 1, halfWidth: 0.4, height: 1.85, speed: 1.6, jumpVelocity: 8, hp: 20, damage: 3, attackCooldown: 0.8, hitRange: 1.2, visual: {width: 1.9, height: 1.85}},
    drowned_baby: {id: "drowned_baby", asset: "drowned_baby", shape: "humanoid", hostile: true, scale: 0.5, halfWidth: 0.25, height: 0.925, speed: 2.1, jumpVelocity: 7, hp: 10, damage: 2, attackCooldown: 0.65, hitRange: 0.9, visual: {width: 0.95, height: 0.925}},
    pig_cold: {id: "pig_cold", asset: "pig_cold", shape: "pig", hostile: false, scale: 1, halfWidth: 0.8, height: 0.9, speed: 0.75, jumpVelocity: 5, hp: 10, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.8, height: 0.9}},
    pig_cold_baby: {id: "pig_cold_baby", asset: "pig_cold_baby", shape: "pig", hostile: false, scale: 0.62, halfWidth: 0.55, height: 0.56, speed: 0.85, jumpVelocity: 4, hp: 6, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.1, height: 0.56}},
    pig_temperate: {id: "pig_temperate", asset: "pig_temperate", shape: "pig", hostile: false, scale: 1, halfWidth: 0.8, height: 0.9, speed: 0.75, jumpVelocity: 5, hp: 10, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.8, height: 0.9}},
    pig_temperate_baby: {id: "pig_temperate_baby", asset: "pig_temperate_baby", shape: "pig", hostile: false, scale: 0.62, halfWidth: 0.55, height: 0.56, speed: 0.85, jumpVelocity: 4, hp: 6, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.1, height: 0.56}},
    pig_warm: {id: "pig_warm", asset: "pig_warm", shape: "pig", hostile: false, scale: 1, halfWidth: 0.8, height: 0.9, speed: 0.75, jumpVelocity: 5, hp: 10, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.8, height: 0.9}},
    pig_warm_baby: {id: "pig_warm_baby", asset: "pig_warm_baby", shape: "pig", hostile: false, scale: 0.62, halfWidth: 0.55, height: 0.56, speed: 0.85, jumpVelocity: 4, hp: 6, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.1, height: 0.56}},
    cow_cold: {id: "cow_cold", asset: "cow_cold", shape: "cow", hostile: false, scale: 1, halfWidth: 0.75, height: 1.2, speed: 0.65, jumpVelocity: 5, hp: 16, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 2.2, height: 1.2}},
    cow_temperate: {id: "cow_temperate", asset: "cow_temperate", shape: "cow", hostile: false, scale: 1, halfWidth: 0.75, height: 1.2, speed: 0.65, jumpVelocity: 5, hp: 16, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 2.2, height: 1.2}},
    cow_warm: {id: "cow_warm", asset: "cow_warm", shape: "cow", hostile: false, scale: 1, halfWidth: 0.75, height: 1.2, speed: 0.65, jumpVelocity: 5, hp: 16, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 2.2, height: 1.2}},
    mooshroom_red: {id: "mooshroom_red", asset: "mooshroom_red", shape: "cow", hostile: false, scale: 1, halfWidth: 0.75, height: 1.2, speed: 0.65, jumpVelocity: 5, hp: 16, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 2.2, height: 1.2}},
    mooshroom_brown: {id: "mooshroom_brown", asset: "mooshroom_brown", shape: "cow", hostile: false, scale: 1, halfWidth: 0.75, height: 1.2, speed: 0.65, jumpVelocity: 5, hp: 16, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 2.2, height: 1.2}},
};

const BIOME_SPAWN_POOLS: Record<string, readonly MobKind[]> = {
    plains: ["zombie", "zombie_baby", "pig_temperate", "pig_temperate_baby", "cow_temperate"],
    forest: ["zombie", "drowned", "drowned_baby", "pig_temperate", "pig_temperate_baby", "cow_temperate"],
    desert: ["husk", "husk_baby", "pig_warm", "pig_warm_baby", "cow_warm"],
    snowy: ["zombie", "zombie_baby", "pig_cold", "pig_cold_baby", "cow_cold"],
    mountains: ["zombie", "drowned", "drowned_baby", "cow_cold", "mooshroom_red", "mooshroom_brown"],
};

/** Chunks within this distance (blocks) of the player get their mobs simulated. */
export const MOB_UPDATE_RADIUS = 48;
/** Mobs within this distance are rendered; beyond the update radius they still animate but skip AI. */
export const MOB_RENDER_RADIUS = 54;
const MOB_DESPAWN_RADIUS = 64;
const MOB_SPAWN_CHANCE = 0.45;
/** 默认仇恨距离（敌对生物发现玩家并开始走向玩家的水平距离），可通过 /aggro 或设置修改。 */
const DEFAULT_AGGRO_RANGE = 24;
const SAME_LEVEL_TOLERANCE = 3;
const MOB_GRAVITY = 28;
const MOB_KNOCKBACK = 5;

/** Deterministic per-chunk mob roll: at most one mob per chunk, or null when the chunk is empty. */
function chunkSpawn(chunkX: number, seed: number): {kind: MobKind; x: number} | null {
    const rng = mulberry32((Math.imul(seed, 0x9e3779b9) ^ Math.imul(chunkX, 0x85ebca6b)) >>> 0);
    if (rng() > MOB_SPAWN_CHANCE) return null;
    const x = chunkX * CHUNK_SIZE + 1 + rng() * (CHUNK_SIZE - 2);
    const pool = BIOME_SPAWN_POOLS[biomeAt(Math.floor(x), seed).id] || BIOME_SPAWN_POOLS.plains;
    const kind = pool[Math.floor(rng() * pool.length)];
    return {kind, x};
}

/**
 * A zombie-style mob: idle until the player comes close, then walks toward them
 * and attacks in melee range. Physics is shared with the player via moveBody.
 */
export class Mob implements PhysicsBody {
    x: number;
    y: number;
    velocityX = 0;
    velocityY = 0;
    onGround = false;
    halfWidth: number;
    height: number;
    facing = 1;
    state: MobState = "idle";
    stateTime = 0;
    hp: number;
    hurtTimer = 0;
    attackCooldown = 0;
    alive = true;
    animationTime = 0;
    hitboxCenterX: number;
    hitboxCenterY: number;
    private knockbackTimer = 0;
    private knockbackX = 0;
    private squeezeTimer = 0;

    constructor(readonly kind: MobKind, x: number, y: number) {
        this.x = x;
        this.y = y;
        this.hp = MOB_KINDS[kind].hp;
        this.halfWidth = 0;
        this.height = 0;
        this.hitboxCenterX = 0;
        this.hitboxCenterY = 0;
        this.applyHitbox();
    }

    /** 按当前配置重新计算碰撞箱（重载碰撞箱/扩展后调用以刷新已有实体）。 */
    applyHitbox(): void {
        const config = MOB_KINDS[this.kind];
        const hitbox = hitboxFor(this.kind);
        this.halfWidth = hitbox?.halfWidth ?? config.halfWidth;
        this.height = hitbox?.height ?? config.height;
        this.hitboxCenterX = hitbox?.centerX ?? 0;
        this.hitboxCenterY = hitbox?.centerY ?? this.height / 2;
    }

    /** 碰撞箱中心世界坐标。 */
    get centerX(): number {
        return this.x + this.hitboxCenterX;
    }
    get centerY(): number {
        return this.y + this.hitboxCenterY;
    }

    /** 物理碰撞用：碰撞箱中心相对锚点的偏移（与渲染/点击共用同一碰撞箱）。 */
    get centerOffsetX(): number {
        return this.hitboxCenterX;
    }
    get centerOffsetY(): number {
        return this.hitboxCenterY;
    }

    /** 碰撞箱四边（中心 + centerX/centerY，半宽 halfWidth、半高 height/2）。 */
    get hitboxLeft(): number {
        return this.centerX - this.halfWidth;
    }
    get hitboxRight(): number {
        return this.centerX + this.halfWidth;
    }
    get hitboxBottom(): number {
        return this.centerY - this.height / 2;
    }
    get hitboxTop(): number {
        return this.centerY + this.height / 2;
    }

    update(dt: number, world: World, player: Player, onPlayerDamage: (amount: number) => void, aggroRange = DEFAULT_AGGRO_RANGE): void {
        const seconds = Math.min(dt, 0.05);
        this.hurtTimer = Math.max(0, this.hurtTimer - seconds);
        this.attackCooldown = Math.max(0, this.attackCooldown - seconds);
        this.animationTime += seconds;
        const config = MOB_KINDS[this.kind];

        const dx = player.x - this.x;
        const distX = Math.abs(dx);
        const dy = player.y + player.height / 2 - this.centerY;
        const sameLevel = Math.abs(dy) < SAME_LEVEL_TOLERANCE;

        const targetState: MobState = config.hostile
            ? distX <= config.hitRange && sameLevel ? "attack" : distX <= aggroRange && sameLevel ? "walk" : "idle"
            : Math.sin((this.animationTime + this.x * 0.13) * 0.8) > 0.45 ? "walk" : "idle";
        if (targetState !== this.state) {
            this.state = targetState;
            this.stateTime = 0;
        }
        this.stateTime += seconds;

        switch (this.state) {
            case "attack":
                this.velocityX = 0;
                if (this.attackCooldown <= 0) {
                    this.attackCooldown = config.attackCooldown;
                    onPlayerDamage(config.damage);
                }
                break;
            case "walk":
                this.facing = config.hostile ? dx >= 0 ? 1 : -1 : Math.sin((this.animationTime + this.x) * 0.4) >= 0 ? 1 : -1;
                this.velocityX = this.facing * config.speed;
                break;
            default:
                this.velocityX = 0;
                break;
        }

        if (this.onGround && this.velocityX !== 0) {
            const ahead = Math.floor(this.centerX + this.facing * (this.halfWidth + 0.02));
            const from = Math.floor(this.hitboxBottom) + 1;
            const to = Math.ceil(this.hitboxTop);
            for (let y = from; y <= to; y += 1) {
                if (world.isSolid(ahead, y)) {
                    this.velocityY = config.jumpVelocity;
                    break;
                }
            }
        }

        this.velocityY -= MOB_GRAVITY * seconds;
        if (this.knockbackTimer > 0) {
            this.knockbackTimer = Math.max(0, this.knockbackTimer - seconds);
            this.velocityX = this.knockbackX;
        }
        moveBody(this, world, seconds);
        if (this.y < WORLD_MIN_Y - 2) this.alive = false;
    }

    /** Deals damage and knockback away from `sourceX`. Returns true when killed. */
    hurt(amount: number, sourceX: number): boolean {
        if (!this.alive) return false;
        this.hp -= amount;
        this.hurtTimer = 0.35;
        this.knockbackTimer = 0.2;
        this.knockbackX = (this.x >= sourceX ? 1 : -1) * MOB_KNOCKBACK;
        this.velocityY = 2;
        if (this.hp <= 0) {
            this.alive = false;
            return true;
        }
        return false;
    }

    /** 方块挤压（窒息）伤害：碰撞箱与实心方块重叠时每 0.5s 受 1 点伤害。 */
    squeezeDamage(dt: number, world: World): void {
        if (!this.overlapsSolid(world)) {
            this.squeezeTimer = 0;
            return;
        }
        this.squeezeTimer += dt;
        if (this.squeezeTimer >= 0.5) {
            this.squeezeTimer = 0;
            this.hp -= 1;
            this.hurtTimer = 0.35;
            if (this.hp <= 0) this.alive = false;
        }
    }

    /** 碰撞箱是否与实心方块重叠（非实心的植物等不算）。 */
    private overlapsSolid(world: World): boolean {
        const left = this.x + this.centerOffsetX - this.halfWidth;
        const right = this.x + this.centerOffsetX + this.halfWidth;
        const bottom = this.y + this.centerOffsetY - this.height / 2;
        const top = this.y + this.centerOffsetY + this.height / 2;
        for (let x = Math.ceil(left); x <= Math.floor(right); x += 1) {
            for (let y = Math.ceil(bottom); y <= Math.floor(top); y += 1) {
                if (world.isSolid(x, y)) return true;
            }
        }
        return false;
    }
}

/**
 * Owns every mob in the world. Mobs are not persisted: each chunk rolls a
 * deterministic spawn from (chunkX, seed), so leaving and re-entering an area
 * repopulates it exactly the same way.
 */
export class MobManager {
    private readonly mobs = new Map<number, Mob>();
    /** Mobs created via /summon: never despawned by distance and not tied to a chunk. */
    private readonly summoned: Mob[] = [];
    /** Chunks whose mob died and stay dead while the chunk stays loaded. */
    private readonly dead = new Set<number>();
    private active = 0;
    /** 仇恨距离（敌对生物发现玩家的水平距离），可通过 /aggro 或设置配置。 */
    aggroRange = DEFAULT_AGGRO_RANGE;

    constructor(private readonly seed: number) {
    }

    /** Number of mobs simulated this frame (within the update radius). */
    get activeCount(): number {
        return this.active;
    }

    /** All alive mobs currently held by the manager. */
    get total(): number {
        return this.mobs.size + this.summoned.length;
    }

    /** Spawns a mob that persists (won't despawn on distance) and returns it. */
    summon(kind: MobKind, x: number, y: number): Mob {
        const mob = new Mob(kind, x, y);
        this.summoned.push(mob);
        return mob;
    }

    /** Re-reads hitbox config for all living mobs (used after /reload hitboxes). */
    refreshHitboxes(): void {
        for (const mob of this.mobs.values()) mob.applyHitbox();
        for (const mob of this.summoned) mob.applyHitbox();
    }

    update(dt: number, world: World, player: Player, onPlayerDamage: (amount: number) => void, onMobKilled: (kind: MobKind, x: number, y: number) => void): void {
        const seconds = Math.min(dt, 0.05);
        const center = Math.floor(player.x / CHUNK_SIZE);

        for (const chunkX of [...this.dead]) {
            if (!world.chunks.has(chunkX)) this.dead.delete(chunkX);
        }

        this.active = 0;
        for (const [chunkX, mob] of [...this.mobs]) {
            if (!mob.alive) {
                onMobKilled(mob.kind, mob.x, mob.y);
                this.dead.add(chunkX);
                this.mobs.delete(chunkX);
                continue;
            }
            const d = Math.hypot(player.x - mob.x, player.y + player.height / 2 - mob.centerY);
            if (d > MOB_DESPAWN_RADIUS) {
                this.mobs.delete(chunkX);
                continue;
            }
            if (d <= MOB_UPDATE_RADIUS) {
                this.active += 1;
                mob.update(seconds, world, player, onPlayerDamage, this.aggroRange);
                mob.squeezeDamage(seconds, world);
            }
        }

        for (let i = this.summoned.length - 1; i >= 0; i -= 1) {
            const mob = this.summoned[i];
            if (!mob.alive) {
                onMobKilled(mob.kind, mob.x, mob.y);
                this.summoned.splice(i, 1);
                continue;
            }
            const d = Math.hypot(player.x - mob.x, player.y + player.height / 2 - mob.centerY);
            if (d <= MOB_UPDATE_RADIUS) {
                this.active += 1;
                mob.update(seconds, world, player, onPlayerDamage, this.aggroRange);
                mob.squeezeDamage(seconds, world);
            }
        }

        this.separateMobs(world);

        for (const chunkX of world.chunks.keys()) {
            if (this.mobs.has(chunkX) || this.dead.has(chunkX)) continue;
            if (Math.abs(chunkX - center) > Math.ceil(MOB_UPDATE_RADIUS / CHUNK_SIZE)) continue;
            const roll = chunkSpawn(chunkX, this.seed);
            if (!roll) continue;
            const xi = Math.floor(roll.x);
            const surface = world.getSurfaceHeight(xi);
            if (structuresNear(xi, this.seed, 0)) continue;
            if (world.isSolid(xi, surface + 1)) continue;
            const mob = new Mob(roll.kind, xi, surface + 1);
            if (mob.hitboxRight >= player.x - player.halfWidth && mob.hitboxLeft <= player.x + player.halfWidth
                && mob.hitboxTop > player.y && mob.hitboxBottom < player.y + player.height) continue;
            this.mobs.set(chunkX, mob);
        }
    }

    /** 生物互挤：把重叠的生物沿水平方向互相推开，防止堆怪。 */
    private separateMobs(world: World): void {
        const mobs = [...this.mobs.values(), ...this.summoned].filter((mob) => mob.alive);
        for (let iteration = 0; iteration < 3; iteration += 1) {
            let moved = false;
            for (let i = 0; i < mobs.length; i += 1) {
                for (let j = i + 1; j < mobs.length; j += 1) {
                    const a = mobs[i], b = mobs[j];
                    const overlapX = a.halfWidth + b.halfWidth - Math.abs(a.x - b.x);
                    const overlapY = (a.height + b.height) / 2 - Math.abs(a.centerY - b.centerY);
                    if (overlapX <= 0 || overlapY <= 0) continue;
                    const direction = a.x < b.x ? 1 : -1;
                    const step = Math.min(overlapX / 2, 0.08);
                    if (this.canShift(a, direction * step, world)) {
                        a.x += direction * step;
                        moved = true;
                    }
                    if (this.canShift(b, -direction * step, world)) {
                        b.x -= direction * step;
                        moved = true;
                    }
                }
            }
            if (!moved) break;
        }
    }

    /** 水平平移 dx 后是否不与实心方块重叠（避免把生物挤进墙里）。 */
    private canShift(mob: Mob, dx: number, world: World): boolean {
        const blockX = dx > 0
            ? Math.floor(mob.x + mob.centerOffsetX + mob.halfWidth + dx)
            : Math.floor(mob.x + mob.centerOffsetX - mob.halfWidth + dx);
        const bottom = Math.floor(mob.y + mob.centerOffsetY - mob.height / 2) + 1;
        const top = Math.ceil(mob.y + mob.centerOffsetY + mob.height / 2);
        for (let y = bottom; y <= top; y += 1) {
            if (world.isSolid(blockX, y)) return false;
        }
        return true;
    }

    /** All mobs within `radius` blocks of the player, for rendering. */
    mobsNear(player: Player, radius: number): Mob[] {
        const result: Mob[] = [];
        for (const mob of [...this.mobs.values(), ...this.summoned]) {
            const d = Math.hypot(player.x - mob.x, player.y + player.height / 2 - mob.centerY);
            if (d <= radius) result.push(mob);
        }
        return result;
    }

    /** First mob whose hitbox contains the cursor point (within reach of the player), or null. */
    hitMob(point: [number, number] | null, player: Player): Mob | null {
        if (!point) return null;
        const [wx, wy] = point;
        if (Math.abs(wx - player.x) > 2.5 || Math.abs(wy - (player.y + player.height / 2)) > 3) return null;
        for (const mob of [...this.mobs.values(), ...this.summoned]) {
            if (wx >= mob.hitboxLeft && wx <= mob.hitboxRight && wy >= mob.hitboxBottom && wy <= mob.hitboxTop) return mob;
        }
        return null;
    }

    /** True when any alive mob's hitbox overlaps the block cell at (cellX, cellY). */
    occupies(cellX: number, cellY: number): boolean {
        for (const mob of [...this.mobs.values(), ...this.summoned]) {
            if (!mob.alive) continue;
            if (mob.hitboxLeft < cellX + 1 && mob.hitboxRight > cellX && mob.hitboxBottom < cellY && mob.hitboxTop > cellY - 1) return true;
        }
        return false;
    }
}
