import {ParticleSystem} from "../core/particles";
import {GameMode, type ModeContext} from "./base";
import {Blocks, blockRegistry, GameModes} from "../core/registry";
import {renderCharacter} from "../core/skeleton";

/** 空手挖掘速度系数（未来工具可放大；硬度 / 速度 = 挖掘耗时秒）。 */
const HAND_MINING_SPEED = 1;
/** 挖掘碎屑粒子发射间隔（秒）。 */
const CHIP_INTERVAL = 0.12;

export class SurvivalMode extends GameMode {
    readonly name = GameModes.SURVIVAL.id;
    readonly particles = new ParticleSystem();
    private mobHitCooldown = 0;
    /** 挖掘动画剩余时长（秒），>0 时播放 dig 姿态。 */
    private mineTimer = 0;
    /** 挖掘动画时钟：站立时也在推进（不复用 walk 时钟，否则站立时动画停在第一帧）。 */
    private mineAnimTime = 0;
    /** 当前正在挖掘的目标格与进度（0..1，满 1 时破坏该方块）。 */
    private mineX = 0;
    private mineY = 0;
    private mineProgress = 0;
    /** 挖掘碎屑发射冷却（秒）。 */
    private chipCooldown = 0;

    update(context: ModeContext): void {
        context.player.update(context.keys, context.dt, context.world);
        this.particles.update(context.dt);
        this.mobHitCooldown = Math.max(0, this.mobHitCooldown - context.dt * 60);
        if (this.mineTimer > 0) this.mineAnimTime += context.dt;
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

        // 挖掘过程中不断掉落方块碎屑。
        this.chipCooldown -= context.dt;
        if (this.chipCooldown <= 0) {
            this.chipCooldown = CHIP_INTERVAL;
            this.particles.chip(x, y, context.blockTextureAt?.(type, x) ?? context.textures.get(type));
        }

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
        const mining = this.mineTimer > 0;
        renderCharacter(ctx, {
            kind: "player",
            pose: mining ? "dig" : player.velocityX ? "walk" : "idle",
            time: mining ? this.mineAnimTime : player.animationT,
            blendKey: player,
            x: player.x,
            y: player.y,
            facing: player.facing,
            blockSize,
            cameraX,
            cameraY,
        });
    }

    renderEffects(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, blockSize: number): void {
        this.particles.render(ctx, cameraX, cameraY, blockSize);
        if (this.mineProgress <= 0) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const sx = (this.mineX - cameraX) * blockSize + width / 2;
        const sy = (cameraY - this.mineY) * blockSize + height / 2;
        this.renderCracks(ctx, sx, sy, blockSize, this.mineProgress);
    }

    /** 在目标方块上按进度绘制裂纹（进度越高裂纹越多）。 */
    private renderCracks(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, progress: number): void {
        const cracks: ReadonlyArray<[number, number, number, number]> = [
            [0.12, 0.55, 0.42, 0.48],
            [0.55, 0.15, 0.5, 0.6],
            [0.18, 0.78, 0.46, 0.88],
            [0.62, 0.72, 0.82, 0.55],
        ];
        const visible = Math.min(cracks.length, Math.floor(progress * cracks.length * 1.2));
        ctx.strokeStyle = "rgba(18,14,10,.78)";
        ctx.lineWidth = Math.max(1, size * 0.045);
        ctx.beginPath();
        for (let i = 0; i < visible; i += 1) {
            const [x0, y0, x1, y1] = cracks[i];
            ctx.moveTo(sx + x0 * size, sy + y0 * size);
            ctx.lineTo(sx + x1 * size, sy + y1 * size);
        }
        ctx.stroke();
    }
}