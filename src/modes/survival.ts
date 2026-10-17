import {ParticleSystem} from "../core/particles";
import {ATTACK_POSE_SECONDS, GameMode, playerPose, type ModeContext} from "./base";
import {Blocks, blockRegistry, GameModes} from "../core/registry";
import {renderCharacter} from "../core/skeleton";
import {playerAttackCooldownFrames, playerAttackDamage} from "../core/attackConfig";
import {attackDamageFor, miningSeconds, miningSpeedFor} from "../core/items";
import type {GameModeName} from "../core/types";

/** 挖掘碎屑粒子发射间隔（秒）。 */
const CHIP_INTERVAL = 0.12;

export class SurvivalMode extends GameMode {
    readonly name: GameModeName = GameModes.SURVIVAL.id;
    /**
     * 是否允许破坏方块。生存模式为 true；冒险模式（`src/modes/adventure.ts`）覆写为 false，
     * 其余行为（受伤、耗方块、工具耐久、攻击伤害、掉落物）全部继承。
     */
    protected readonly canMine: boolean = true;
    readonly particles = new ParticleSystem();
    private mobHitCooldown = 0;
    /** 挖掘动画剩余时长（秒），>0 时播放 dig 姿态。 */
    private mineTimer = 0;
    /** 挖掘动画时钟：站立时也在推进（不复用 walk 时钟，否则站立时动画停在第一帧）。 */
    private mineAnimTime = 0;
    /** 攻击动画剩余时长（秒），>0 时播放 attack 姿态（点中生物）；与挖方块的 dig 分开。 */
    private attackTimer = 0;
    /** 攻击动画时钟（同 mineAnimTime，站立攻击时也要能推进）。 */
    private attackAnimTime = 0;
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
        if (this.attackTimer > 0) this.attackAnimTime += context.dt;
        this.attackTimer = Math.max(0, this.attackTimer - context.dt);

        if (!context.mouseDown) {
            this.mineProgress = 0;
            return;
        }

        const hit = context.mobs.hitMob(context.mouseWorld, context.player);
        if (hit) {
            this.mineProgress = 0;
            // 攻击生物播放 attack.myanim（不是挖方块的 dig.myanim）。
            this.attackTimer = ATTACK_POSE_SECONDS;
            if (this.mobHitCooldown <= 0) {
                // 手持工具（剑等）按物品配置的伤害结算，空手回落到 attackConfig 的默认值。
                hit.hurt(attackDamageFor(context.heldItem?.id, playerAttackDamage()), context.player.x);
                context.onToolUsed?.(1);
                this.mobHitCooldown = playerAttackCooldownFrames();
            }
            return;
        }

        // 冒险模式：只能攻击生物，不能破坏方块（不显示裂纹、不掉落、不耗耐久）。
        if (!this.canMine) {
            this.mineProgress = 0;
            return;
        }

        const hovered = context.hovered;
        if (!hovered) {
            this.mineProgress = 0;
            return;
        }

        const [x, y, type] = hovered;
        const definition = blockRegistry.get(type);
        // 生存模式不可破坏基岩，也不可挖掘流体等不可携带（cannot_give）方块。
        if (type === Blocks.MY2DWORLD.BEDROCK.id || definition?.nbt?.cannot_give) {
            this.mineProgress = 0;
            return;
        }
        if (this.mineX !== x || this.mineY !== y) {
            this.mineX = x;
            this.mineY = y;
            this.mineProgress = 0;
        }
        // 手持对口工具（镐挖石 / 斧砍木 / 锹铲土 / 锄收树叶）时按工具的 miningSpeed 加速；
        // 空手或工具类别不符仍是空手速度 1。耗时 = 硬度 / 速度（秒，见 core/items.ts 的 miningSeconds）。
        const speed = miningSpeedFor(context.heldItem?.id, definition?.tool);
        this.mineProgress += context.dt / miningSeconds(definition?.hardness, speed);
        this.mineTimer = 0.15;

        // 挖掘过程中不断掉落方块碎屑。
        this.chipCooldown -= context.dt;
        if (this.chipCooldown <= 0) {
            this.chipCooldown = CHIP_INTERVAL;
            this.particles.chip(x, y, context.blockTextureAt?.(type, x) ?? context.textures.get(type));
        }

        if (this.mineProgress >= 1) {
            // 支撑消失而被级联破坏的地物（花/草/仙人掌）也走 onBlockBroken：一并掉落自身。
            if (context.world.breakBlock(x, y, (bx, by, block) => context.onBlockBroken?.(bx, by, block.id))) {
                this.particles.spawn(x, y, context.blockTextureAt?.(type, x) ?? context.textures.get(type));
                // 挖掉一格消耗手持工具 1 点耐久（没有耐久的物品不会被扣）。
                context.onToolUsed?.(1);
            }
            this.mineProgress = 0;
        }
    }

    renderPlayer(ctx: CanvasRenderingContext2D, context: ModeContext, cameraX: number, cameraY: number): void {
        const {player, blockSize} = context;
        // 姿态优先级：攻击（点中生物，attack.myanim）> 挖掘（挖方块，dig.myanim）> 走/站。
        const attacking = this.attackTimer > 0;
        const mining = !attacking && this.mineTimer > 0;
        const pose = playerPose(attacking, mining, player.velocityX !== 0);
        const time = attacking ? this.attackAnimTime : mining ? this.mineAnimTime : player.animationT;
        renderCharacter(ctx, {
            kind: "player",
            pose,
            time,
            blendKey: player,
            x: player.x,
            y: player.y,
            facing: player.facing,
            blockSize,
            cameraX,
            cameraY,
            itemImages: context.itemImages,
            // 环境光照：玩家按身体中心所处深度压暗（夜里/洞里更暗）。
            brightness: context.lightAt?.(player.x, player.y + player.height / 2) ?? 1,
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