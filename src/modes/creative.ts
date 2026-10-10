import {ParticleSystem} from "../core/particles";
import {GameMode, type ModeContext} from "./base";
import {blockRegistry, GameModes} from "../core/registry";
import {renderCharacter} from "../core/skeleton";
import {playerAttackDamage} from "../core/attackConfig";

export class CreativeMode extends GameMode {
    readonly name = GameModes.CREATIVE.id;
    readonly particles = new ParticleSystem();
    private breakCooldown = 0;

    update(context: ModeContext): void {
        context.player.update(context.keys, context.dt, context.world);
        this.particles.update(context.dt);
        this.breakCooldown = Math.max(0, this.breakCooldown - context.dt * 60);
        if (context.mouseDown && this.breakCooldown <= 0) {
            const hit = context.mobs.hitMob(context.mouseWorld, context.player);
            if (hit) {
                hit.hurt(playerAttackDamage(), context.player.x);
                this.breakCooldown = 8;
            } else if (context.hovered) {
                const [x, y, type] = context.hovered;
                // 流体等不可携带（cannot_give）方块不因点击被破坏（无法变成物品）。
                if (!blockRegistry.get(type)?.nbt?.cannot_give && context.world.breakBlock(x, y)) {
                    this.particles.spawn(x, y, context.blockTextureAt?.(type, x) ?? context.textures.get(type));
                    context.onBlockBroken?.(x, y, type);
                }
                this.breakCooldown = 8;
            }
        }
    }

    renderPlayer(ctx: CanvasRenderingContext2D, context: ModeContext, cameraX: number, cameraY: number): void {
        const {player, blockSize} = context;
        renderCharacter(ctx, {
            kind: "player",
            pose: player.velocityX ? "walk" : "idle",
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

    renderEffects(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, blockSize: number): void {
        this.particles.render(ctx, cameraX, cameraY, blockSize);
    }
}
