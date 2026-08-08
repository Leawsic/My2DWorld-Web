import {CHUNK_SIZE, type World} from "./world";
import type {Player} from "./player";
import {moveBody, type PhysicsBody} from "./physics";
import {mulberry32} from "./noise";

export type MobKind = "zombie" | "husk" | "drowned";
export type MobState = "idle" | "walk" | "attack";

export interface MobKindConfig {
    readonly id: MobKind;
    /** Asset folder under /assets/entity/. */
    readonly dir: string;
    readonly moveFrames: number;
    readonly attackFrames: number;
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
    zombie: {id: "zombie", dir: "zombie", moveFrames: 4, attackFrames: 9, speed: 1.6, jumpVelocity: 8, hp: 20, damage: 3, attackCooldown: 0.8, hitRange: 1.2, visual: {width: 1.9, height: 1.9}},
    husk: {id: "husk", dir: "husk", moveFrames: 4, attackFrames: 9, speed: 1.6, jumpVelocity: 8, hp: 20, damage: 3, attackCooldown: 0.8, hitRange: 1.2, visual: {width: 1.9, height: 1.9}},
    drowned: {id: "drowned", dir: "drowned", moveFrames: 8, attackFrames: 9, speed: 1.6, jumpVelocity: 8, hp: 20, damage: 3, attackCooldown: 0.8, hitRange: 1.2, visual: {width: 1.9, height: 1.9}},
};

const MOB_KINDS_ORDER: MobKind[] = ["zombie", "husk", "drowned"];

/** Chunks within this distance (blocks) of the player get their mobs simulated. */
export const MOB_UPDATE_RADIUS = 48;
/** Mobs within this distance are rendered; beyond the update radius they still animate but skip AI. */
export const MOB_RENDER_RADIUS = 54;
const MOB_DESPAWN_RADIUS = 64;
const MOB_SPAWN_CHANCE = 0.45;
const AGGRO_RANGE = 10;
const SAME_LEVEL_TOLERANCE = 3;
const MOB_GRAVITY = 28;
const MOB_KNOCKBACK = 5;

/** Deterministic per-chunk mob roll: at most one mob per chunk, or null when the chunk is empty. */
function chunkSpawn(chunkX: number, seed: number): {kind: MobKind; x: number} | null {
    const rng = mulberry32((Math.imul(seed, 0x9e3779b9) ^ Math.imul(chunkX, 0x85ebca6b)) >>> 0);
    if (rng() > MOB_SPAWN_CHANCE) return null;
    const kind = MOB_KINDS_ORDER[Math.floor(rng() * MOB_KINDS_ORDER.length)];
    const x = chunkX * CHUNK_SIZE + 1 + rng() * (CHUNK_SIZE - 2);
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
    readonly halfWidth = 0.25;
    readonly height = 1.9;
    facing = 1;
    state: MobState = "idle";
    stateTime = 0;
    hp: number;
    hurtTimer = 0;
    attackCooldown = 0;
    alive = true;
    animationTime = 0;
    private knockbackTimer = 0;
    private knockbackX = 0;

    constructor(readonly kind: MobKind, x: number, y: number) {
        this.x = x;
        this.y = y;
        this.hp = MOB_KINDS[kind].hp;
    }

    update(dt: number, world: World, player: Player, onPlayerDamage: (amount: number) => void): void {
        const seconds = Math.min(dt, 0.05);
        this.hurtTimer = Math.max(0, this.hurtTimer - seconds);
        this.attackCooldown = Math.max(0, this.attackCooldown - seconds);
        this.animationTime += seconds;
        const config = MOB_KINDS[this.kind];

        const dx = player.x - this.x;
        const distX = Math.abs(dx);
        const dy = player.y + player.height / 2 - (this.y + this.height / 2);
        const sameLevel = Math.abs(dy) < SAME_LEVEL_TOLERANCE;

        const targetState: MobState = distX <= config.hitRange && sameLevel ? "attack" : distX <= AGGRO_RANGE && sameLevel ? "walk" : "idle";
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
                this.facing = dx >= 0 ? 1 : -1;
                this.velocityX = this.facing * config.speed;
                break;
            default:
                this.velocityX = 0;
                break;
        }

        if (this.onGround && this.velocityX !== 0) {
            const ahead = Math.floor(this.x + this.facing * (this.halfWidth + 0.02));
            const from = Math.floor(this.y) + 1;
            const to = Math.ceil(this.y + this.height);
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
        if (this.y < -40) this.alive = false;
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
}

/**
 * Owns every mob in the world. Mobs are not persisted: each chunk rolls a
 * deterministic spawn from (chunkX, seed), so leaving and re-entering an area
 * repopulates it exactly the same way.
 */
export class MobManager {
    private readonly mobs = new Map<number, Mob>();
    /** Chunks whose mob died and stay dead while the chunk stays loaded. */
    private readonly dead = new Set<number>();
    private active = 0;

    constructor(private readonly seed: number) {
    }

    /** Number of mobs simulated this frame (within the update radius). */
    get activeCount(): number {
        return this.active;
    }

    /** All alive mobs currently held by the manager. */
    get total(): number {
        return this.mobs.size;
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
            const d = Math.hypot(player.x - mob.x, player.y + player.height / 2 - (mob.y + mob.height / 2));
            if (d > MOB_DESPAWN_RADIUS) {
                this.mobs.delete(chunkX);
                continue;
            }
            if (d <= MOB_UPDATE_RADIUS) {
                this.active += 1;
                mob.update(seconds, world, player, onPlayerDamage);
            }
        }

        for (const chunkX of world.chunks.keys()) {
            if (this.mobs.has(chunkX) || this.dead.has(chunkX)) continue;
            if (Math.abs(chunkX - center) > Math.ceil(MOB_UPDATE_RADIUS / CHUNK_SIZE)) continue;
            const roll = chunkSpawn(chunkX, this.seed);
            if (!roll) continue;
            const xi = Math.floor(roll.x);
            const surface = world.getSurfaceHeight(xi);
            if (world.isSolid(xi, surface + 1)) continue;
            const mob = new Mob(roll.kind, xi, surface + 1);
            if (mob.x + mob.halfWidth >= player.x - player.halfWidth && mob.x - mob.halfWidth <= player.x + player.halfWidth
                && surface + 1 < player.y + player.height && surface + 1 + mob.height > player.y) continue;
            this.mobs.set(chunkX, mob);
        }
    }

    /** All mobs within `radius` blocks of the player, for rendering. */
    mobsNear(player: Player, radius: number): Mob[] {
        const result: Mob[] = [];
        for (const mob of this.mobs.values()) {
            const d = Math.hypot(player.x - mob.x, player.y + player.height / 2 - (mob.y + mob.height / 2));
            if (d <= radius) result.push(mob);
        }
        return result;
    }

    /** First mob whose hitbox contains the cursor point (within reach of the player), or null. */
    hitMob(point: [number, number] | null, player: Player): Mob | null {
        if (!point) return null;
        const [wx, wy] = point;
        if (Math.abs(wx - player.x) > 2.5 || Math.abs(wy - (player.y + player.height / 2)) > 3) return null;
        for (const mob of this.mobs.values()) {
            if (wx >= mob.x - mob.halfWidth && wx <= mob.x + mob.halfWidth && wy >= mob.y && wy <= mob.y + mob.height) return mob;
        }
        return null;
    }
}
