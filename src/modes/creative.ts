import {ParticleSystem} from "../core/particles";
import {ATTACK_POSE_SECONDS, GameMode, playerPose, type ModeContext} from "./base";
import {blockRegistry, GameModes} from "../core/registry";
import {renderCharacter} from "../core/skeleton";
import {playerAttackDamage} from "../core/attackConfig";
import {attackDamageFor} from "../core/items";

export class CreativeMode extends GameMode {
    readonly name = GameModes.CREATIVE.id;
    readonly particles = new ParticleSystem();
    private breakCooldown = 0;
    /** 攻击动画剩余时长（秒）：命中生物时播放 attack.myanim（与挖方块的 dig 分开）。 */
    private attackTimer = 0;
    private attackAnimTime = 0;

    update(context: ModeContext): void {
        context.player.update(context.keys, context.dt, context.world);
        this.particles.update(context.dt);
        this.breakCooldown = Math.max(0, this.breakCooldown - context.dt * 60);
        if (this.attackTimer > 0) this.attackAnimTime += context.dt;
        this.attackTimer = Math.max(0, this.attackTimer - context.dt);
        if (context.mouseDown && this.breakCooldown <= 0) {
            const hit = context.mobs.hitMob(context.mouseWorld, context.player);
            if (hit) {
                // 创造模式也按手持工具的伤害结算（但不消耗耐久：创造模式物品不损耗）。
                hit.hurt(attackDamageFor(context.heldItem?.id, playerAttackDamage()), context.player.x);
                this.attackTimer = ATTACK_POSE_SECONDS;
                this.breakCooldown = 8;
            } else if (context.hovered) {
                const [x, y, type] = context.hovered;
                // 流体等不可携带（cannot_give）方块不因点击被破坏（无法变成物品）。
                // 支撑消失而被级联破坏的地物同样通过 onBlockBroken 上报。
                const broken = blockRegistry.get(type)?.nbt?.cannot_give
                    ? null
                    : context.world.breakBlock(x, y, (bx, by, block) => context.onBlockBroken?.(bx, by, block.id));
                if (broken) {
                    this.particles.spawn(x, y, context.blockTextureAt?.(type, x) ?? context.textures.get(type));
                }
                this.breakCooldown = 8;
            }
        }
    }

    renderPlayer(ctx: CanvasRenderingContext2D, context: ModeContext, cameraX: number, cameraY: number): void {
        const {player, blockSize} = context;
        const attacking = this.attackTimer > 0;
        const pose = playerPose(attacking, false, player.velocityX !== 0);
        renderCharacter(ctx, {
            kind: "player",
            pose,
            time: attacking ? this.attackAnimTime : player.animationT,
            blendKey: player,
            x: player.x,
            y: player.y,
            facing: player.facing,
            blockSize,
            cameraX,
            cameraY,
            itemImages: context.itemImages,
            // 环境光照：玩家按身体中心所处深度压暗。
            brightness: context.lightAt?.(player.x, player.y + player.height / 2) ?? 1,
        });
    }

    renderEffects(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, blockSize: number): void {
        this.particles.render(ctx, cameraX, cameraY, blockSize);
    }
}
