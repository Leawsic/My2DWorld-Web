import {ParticleSystem} from "../core/particles";
import {GameMode, type ModeContext} from "./base";
import {GameModes} from "../core/registry";
import {renderCharacter} from "../core/skeleton";

export class SurvivalMode extends GameMode {
    readonly name = GameModes.SURVIVAL.id;
    readonly particles = new ParticleSystem();
    private breakCooldown = 0;
    /** 挖掘动画剩余时长（秒），>0 时播放 dig 姿态。 */
    private mineTimer = 0;

    update(context: ModeContext): void {
        context.player.update(context.keys, context.dt, context.world);
        this.particles.update(context.dt);
        this.breakCooldown = Math.max(0, this.breakCooldown - context.dt * 60);
        this.mineTimer = Math.max(0, this.mineTimer - context.dt);
        if (context.mouseDown && this.breakCooldown <= 0) {
            const hit = context.mobs.hitMob(context.mouseWorld, context.player);
            if (hit) {
                hit.hurt(5, context.player.x);
                this.mineTimer = 0.3;
                this.breakCooldown = 8;
            } else if (context.hovered) {
                const [x, y, type] = context.hovered;
                if (context.world.breakBlock(x, y)) {
                    this.particles.spawn(x, y, context.blockTextureAt?.(type, x) ?? context.textures.get(type));
                    context.onBlockBroken?.(x, y, type);
                }
                this.mineTimer = 0.3;
                this.breakCooldown = 8;
            }
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