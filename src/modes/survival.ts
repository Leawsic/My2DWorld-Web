import {ParticleSystem} from "../core/particles";
import {GameMode, type ModeContext} from "./base";
import {Blocks, blockRegistry, GameModes} from "../core/registry";
import {renderCharacter} from "../core/skeleton";

/** 空手挖掘速度系数（未来工具可放大；硬度 / 速度 = 挖掘耗时秒）。 */
const HAND_MINING_SPEED = 1;

export class SurvivalMode extends GameMode {
    readonly name = GameModes.SURVIVAL.id;
    readonly particles = new ParticleSystem();
    private mobHitCooldown = 0;
    /** 挖掘动画剩余时长（秒），>0 时播放 dig 姿态。 */
    private mineTimer = 0;
    /** 当前正在挖掘的目标格与进度（0..1，满 1 时破坏该方块）。 */
    private mineX = 0;
    private mineY = 0;
    private mineProgress = 0;

    update(context: ModeContext): void {
        context.player.update(context.keys, context.dt, context.world);
        this.particles.update(context.dt);
        this.mobHitCooldown = Math.max(0, this.mobHitCooldown - context.dt * 60);
        this.mineTimer = Math.max(0, this.mineTimer - context.dt);

        if (!context.mouseDown) {
            this.mineProgress = 0;
            return;
        }

        const hit = context.mobs.hitMob(context.mouseWorld, context.player);
        if (hit) {
            this.mineProgress = 0;
            this.mineTimer = 0.3;
            if (this.mobHitCooldown <= 0) {
                hit.hurt(5, context.player.x);
                this.mobHitCooldown = 8;
            }
            return;
        }

        const hovered = context.hovered;
        if (!hovered) {
            this.mineProgress = 0;
            return;
        }

        const [x, y, type] = hovered;
        // 生存模式不可破坏基岩。
        if (type === Blocks.MY2DWORLD.BEDROCK.id) {
            this.mineProgress = 0;
            return;
        }
        if (this.mineX !== x || this.mineY !== y) {
            this.mineX = x;
            this.mineY = y;
            this.mineProgress = 0;
        }
        const hardness = Math.max(0.05, blockRegistry.get(type)?.hardness ?? 1);
        this.mineProgress += context.dt / (hardness / HAND_MINING_SPEED);
        this.mineTimer = 0.15;
        if (this.mineProgress >= 1) {
            if (context.world.breakBlock(x, y)) {
                this.particles.spawn(x, y, context.blockTextureAt?.(type, x) ?? context.textures.get(type));
                context.onBlockBroken?.(x, y, type);
            }
            this.mineProgress = 0;
        }
    }

    renderPlayer(ctx: CanvasRenderingContext2D, context: ModeContext, cameraX: number, cameraY: number): void {
        const {player, blockSize} = context;
        renderCharacter(ctx, {
            kind: "player",
            pose: this.mineTimer > 0 ? "dig" : player.velocityX ? "walk" : "idle",
            time: player.animationT,
            blendKey: player,
            x: player.x,
            y: player.y,
            facing: player.facing,
            blockSize,
            cameraX,
            cameraY,
        });
    }
}