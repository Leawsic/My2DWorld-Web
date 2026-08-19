import {biomeAt, CHUNK_SIZE, WORLD_MIN_Y, type World} from "./world";
import type {Player} from "./player";
import {canShiftX, moveBody, resolveEntityCollision, type PhysicsBody} from "./physics";
import {mulberry32} from "./noise";
import {structuresNear} from "./structures";
import {hitboxFor} from "./hitboxes";

export type MobKind =
    | "zombie" | "zombie_baby" | "husk" | "husk_baby" | "drowned" | "drowned_baby"
    | "pig_cold" | "pig_cold_baby" | "pig_temperate" | "pig_temperate_baby" | "pig_warm" | "pig_warm_baby"
    | "cow_cold" | "cow_temperate" | "cow_warm" | "mooshroom_red" | "mooshroom_brown"
    | "cow_cold_baby" | "cow_temperate_baby" | "cow_warm_baby" | "mooshroom_red_baby" | "mooshroom_brown_baby";
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
    cow_cold_baby: {id: "cow_cold_baby", asset: "cow_cold_baby", shape: "cow", hostile: false, scale: 0.62, halfWidth: 0.5, height: 0.75, speed: 0.85, jumpVelocity: 4, hp: 8, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.4, height: 0.75}},
    cow_temperate_baby: {id: "cow_temperate_baby", asset: "cow_temperate_baby", shape: "cow", hostile: false, scale: 0.62, halfWidth: 0.5, height: 0.75, speed: 0.85, jumpVelocity: 4, hp: 8, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.4, height: 0.75}},
    cow_warm_baby: {id: "cow_warm_baby", asset: "cow_warm_baby", shape: "cow", hostile: false, scale: 0.62, halfWidth: 0.5, height: 0.75, speed: 0.85, jumpVelocity: 4, hp: 8, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.4, height: 0.75}},
    mooshroom_red_baby: {id: "mooshroom_red_baby", asset: "mooshroom_red_baby", shape: "cow", hostile: false, scale: 0.62, halfWidth: 0.5, height: 0.75, speed: 0.85, jumpVelocity: 4, hp: 8, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.4, height: 0.75}},
    mooshroom_brown_baby: {id: "mooshroom_brown_baby", asset: "mooshroom_brown_baby", shape: "cow", hostile: false, scale: 0.62, halfWidth: 0.5, height: 0.75, speed: 0.85, jumpVelocity: 4, hp: 8, damage: 0, attackCooldown: 0, hitRange: 0, visual: {width: 1.4, height: 0.75}},
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
/** 实体间碰撞的恢复系数（弹性）：碰撞后沿法线反弹的比例。 */
const ENTITY_RESTITUTION = 0.3;
/** 玩家主动推怪时的质量因子（略大于生物，可轻微顶回玩家）。 */
const PLAYER_PUSH_FACTOR = 6;
/** 玩家静止/远离时视为不可推动的墙的质量因子。 */
const PLAYER_IMMOVABLE_FACTOR = 100;
const MOB_MIN_MASS = 0.1;
/** 生物被玩家顶住时短暂弹开的速度与时长（AI 结束后恢复寻路）。 */
const MOB_ELASTIC_BOUNCE = 1.5;
const MOB_ELASTIC_BOUNCE_TIME = 0.1;
/** MC 式实体挤压伤害参数。 */
const SQUEEZE_RADIUS = 10;              // 检测半径：仅检查玩家附近实体（性能）
const SQUEEZE_BASE_DAMAGE = 2;          // 基础伤害
const SQUEEZE_THRESHOLD_RATIO = 0.4;    // 水平重叠深度超过实体宽度 40% 才判定为挤压
const SQUEEZE_CONTACT = 0.05;           // 墙角挤压所需的最小接触深度
const SQUEEZE_IFRAME = 1;               // 挤压无敌帧（秒），期间不再受挤压伤害（击退仍生效）
const SQUEEZE_MAX_DAMAGE = 10;          // 单次结算上限：多实体挤压线性叠加但不超此值
const SQUEEZE_DIFFICULTY = 1;           // 难度系数（普通=1，困难=1.5）
const SQUEEZE_CORNER_MULTIPLIER = 2;    // 被实体+实心方块夹击（墙角窒息）时伤害翻倍
const SQUEEZE_CORNER_FLOOR = 0.5;       // 墙角挤压的深度下限比例（接触即可生效）
const PLAYER_SQUEEZE_DAMAGE_RATIO = 0.5; // 玩家挤压怪物时伤害减半（主要效果是推开）
/** 亡灵生物（挤压附带缓慢效果，时长/减速比例在 main/player 侧）。 */
const UNDEAD_KINDS: readonly MobKind[] = ["zombie", "zombie_baby", "husk", "husk_baby", "drowned", "drowned_baby"];

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
    /** 实体挤压伤害的 1s 无敌帧计时（期间不再被挤压扣血，但击退仍生效）。 */
    squeezeIframe = 0;

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
        this.squeezeIframe = Math.max(0, this.squeezeIframe - seconds);
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

    /** 弹性碰撞反弹：沿 dirX 方向短暂弹开（受击击退优先，AI 结束后恢复寻路）。 */
    elasticBounce(dirX: number): void {
        if (this.knockbackTimer > 0) return;
        this.knockbackTimer = MOB_ELASTIC_BOUNCE_TIME;
        this.knockbackX = dirX * MOB_ELASTIC_BOUNCE;
    }

    /** 实体挤压伤害：进入 1s 挤压无敌帧并扣血。返回是否死亡。 */
    takeSqueezeDamage(amount: number): boolean {
        if (!this.alive || this.squeezeIframe > 0) return false;
        this.squeezeIframe = SQUEEZE_IFRAME;
        this.hp -= amount;
        this.hurtTimer = 0.35;
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

    update(dt: number, world: World, player: Player, onPlayerDamage: (amount: number) => void, onMobKilled: (kind: MobKind, x: number, y: number) => void, collideWithPlayer = true, onPlayerSqueezed: (damage: number, undead: boolean) => void = () => undefined): void {
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

        // 实体挤压伤害需在分离（separateBodies）之前结算：此刻帧内重叠深度是最新值
        this.squeezeEntities(world, player, onPlayerSqueezed);
        this.separateBodies(world, player, collideWithPlayer);

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

    /** 实体互挤：所有活着的生物两两之间、以及与玩家之间的 AABB 重叠按质量加权完全推开，
     *  并施加弹性反弹，防止堆怪、重叠闪烁与穿体。推入实心方块的方向会被拒绝。 */
    private separateBodies(world: World, player: Player, collideWithPlayer: boolean): void {
        const mobs = [...this.mobs.values(), ...this.summoned].filter((mob) => mob.alive);
        for (let iteration = 0; iteration < 3; iteration += 1) {
            let moved = false;
            for (let i = 0; i < mobs.length; i += 1) {
                const a = mobs[i];
                if (collideWithPlayer && this.resolvePlayerMob(a, player, world)) moved = true;
                for (let j = i + 1; j < mobs.length; j += 1) {
                    if (this.resolveMobMob(a, mobs[j], world)) moved = true;
                }
            }
            if (!moved) break;
        }
    }

    /** 等效质量：越大越难被推动（面积近似）。 */
    private static mobMass(mob: Mob): number {
        return Math.max(MOB_MIN_MASS, mob.halfWidth * 2 * mob.height);
    }

    /**
     * MC 式实体挤压伤害（每帧在分离之前结算，此时帧内重叠深度是最新值）：
     * - 只算水平（X 轴）重叠；垂直踩踏不视为挤压。
     * - 水平重叠深度超过实体宽度 40% 才触发；伤害 = 基础 × (重叠深度/宽度) × 难度。
     * - 同一实体被多个实体挤压时线性叠加，但单次结算不超过上限。
     * - 受击方获得 1s 挤压无敌帧（击退不受影响）。
     * - 被实体 + 实心方块夹击（墙角窒息）时伤害翻倍。
     * - 玩家挤压怪物伤害减半并推开；亡灵生物挤压玩家附带 5s 缓慢。
     */
    private squeezeEntities(world: World, player: Player, onPlayerSqueezed: (damage: number, undead: boolean) => void): void {
        const mobs = [...this.mobs.values(), ...this.summoned].filter(
            (mob) => mob.alive && Math.hypot(player.x - mob.x, player.y + player.height / 2 - mob.centerY) <= SQUEEZE_RADIUS,
        );
        const mobDamage = new Map<Mob, number>();
        const mobShove = new Map<Mob, number>();
        let playerDamage = 0;
        let playerUndead = false;

        /** 单个方向的挤压伤害；返回 0 表示未达阈值。corner 表示受害者的背面紧贴实心方块。 */
        const squeezedBy = (victim: PhysicsBody, pusher: PhysicsBody, penX: number, dmgScale: number): {dmg: number; corner: boolean} => {
            const width = victim.halfWidth * 2;
            const ratio = penX / width;
            const vcx = victim.x + (victim.centerOffsetX ?? 0);
            const pcx = pusher.x + (pusher.centerOffsetX ?? 0);
            // 逃逸方向 = 远离挤压者的一侧；该方向被实心方块挡住即为「墙角窒息」
            const corner = penX > SQUEEZE_CONTACT && !canShiftX(victim, vcx >= pcx ? 0.2 : -0.2, world);
            if (!corner && ratio < SQUEEZE_THRESHOLD_RATIO) return {dmg: 0, corner: false};
            const depth = Math.min(1, corner ? Math.max(SQUEEZE_CORNER_FLOOR, ratio) : ratio);
            const dmg = SQUEEZE_BASE_DAMAGE * depth * SQUEEZE_DIFFICULTY * (corner ? SQUEEZE_CORNER_MULTIPLIER : 1) * dmgScale;
            return {dmg, corner};
        };

        // 玩家 × 生物
        for (const mob of mobs) {
            const penX = player.halfWidth + mob.halfWidth - Math.abs(player.x - mob.centerX);
            const penY = (player.height + mob.height) / 2 - Math.abs(player.y + player.height / 2 - mob.centerY);
            if (penX <= 0 || penY <= 0) continue;
            const onMob = squeezedBy(mob, player, penX, PLAYER_SQUEEZE_DAMAGE_RATIO);
            if (onMob.dmg > 0) {
                mobDamage.set(mob, Math.min(SQUEEZE_MAX_DAMAGE, (mobDamage.get(mob) ?? 0) + onMob.dmg));
                mobShove.set(mob, mob.x >= player.x ? 1 : -1);
            }
            const onPlayer = squeezedBy(player, mob, penX, 1);
            if (onPlayer.dmg > 0) {
                playerDamage = Math.min(SQUEEZE_MAX_DAMAGE, playerDamage + onPlayer.dmg);
                if (UNDEAD_KINDS.includes(mob.kind)) playerUndead = true;
            }
        }
        // 生物 × 生物（互相挤压）
        for (let i = 0; i < mobs.length; i += 1) {
            for (let j = i + 1; j < mobs.length; j += 1) {
                const a = mobs[i], b = mobs[j];
                const penX = a.halfWidth + b.halfWidth - Math.abs(a.centerX - b.centerX);
                const penY = (a.height + b.height) / 2 - Math.abs(a.centerY - b.centerY);
                if (penX <= 0 || penY <= 0) continue;
                const dA = squeezedBy(a, b, penX, 1);
                if (dA.dmg > 0) mobDamage.set(a, Math.min(SQUEEZE_MAX_DAMAGE, (mobDamage.get(a) ?? 0) + dA.dmg));
                const dB = squeezedBy(b, a, penX, 1);
                if (dB.dmg > 0) mobDamage.set(b, Math.min(SQUEEZE_MAX_DAMAGE, (mobDamage.get(b) ?? 0) + dB.dmg));
            }
        }

        // 结算：生物扣血（各自 1s 无敌帧）；被玩家挤压的额外推开
        for (const [mob, dmg] of mobDamage) {
            if (mob.takeSqueezeDamage(dmg)) continue;
            const shove = mobShove.get(mob);
            if (shove) mob.elasticBounce(shove);
        }
        if (playerDamage > 0) onPlayerSqueezed(playerDamage, playerUndead);
    }

    /** 生物 × 生物：质量加权推开 + 弹性反弹。 */
    private resolveMobMob(a: Mob, b: Mob, world: World): boolean {
        return resolveEntityCollision(a, b, MobManager.mobMass(a), MobManager.mobMass(b), world, ENTITY_RESTITUTION);
    }

    /** 生物 × 玩家：玩家主动推怪时用正常质量（可被轻微顶回），否则视为不可推动的墙。
     *  被玩家顶住且未主动推怪的生物会短暂弹开（可见的「弹开」效果）。 */
    private resolvePlayerMob(mob: Mob, player: Player, world: World): boolean {
        const ax = player.x, ay = player.y + player.height / 2;
        const bx = mob.centerX, by = mob.centerY;
        const penX = player.halfWidth + mob.halfWidth - Math.abs(bx - ax);
        const penY = (player.height + mob.height) / 2 - Math.abs(by - ay);
        const axis = penX <= penY ? "x" : "y";
        const dir = (axis === "x" ? bx - ax : by - ay) >= 0 ? 1 : -1;
        const v = axis === "x" ? player.velocityX : player.velocityY;
        const pushing = v !== 0 && Math.sign(v) === Math.sign(dir);
        const base = player.halfWidth * 2 * player.height;
        const playerMass = pushing ? base * PLAYER_PUSH_FACTOR : base * PLAYER_IMMOVABLE_FACTOR;
        const moved = resolveEntityCollision(mob, player, MobManager.mobMass(mob), playerMass, world, ENTITY_RESTITUTION);
        if (moved && !pushing && axis === "x") mob.elasticBounce(mob.x >= player.x ? 1 : -1);
        return moved;
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
