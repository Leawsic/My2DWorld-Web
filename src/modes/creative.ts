import { ParticleSystem } from "../core/particles";
import { GameMode, type ModeContext } from "./base";

export class CreativeMode extends GameMode {
  readonly name = "creative" as const;
  readonly particles = new ParticleSystem();
  private readonly stand = this.loadImage("/assets/player/steve/stand/1.png");
  private readonly move = [1, 2, 3, 4].map((frame) => this.loadImage(`/assets/player/steve/move/${frame}.png`));
  private breakCooldown = 0;

  update(context: ModeContext): void {
    context.player.update(context.keys, context.dt, context.world);
    this.particles.update(context.dt);
    this.breakCooldown = Math.max(0, this.breakCooldown - context.dt * 60);
    if (context.mouseDown && context.hovered && this.breakCooldown <= 0) {
      const [x, y, type] = context.hovered;
      if (context.world.breakBlock(x, y)) { this.particles.spawn(x, y, context.textures.get(type)); context.onBlockBroken?.(x, y, type); }
      this.breakCooldown = 8;
    }
  }

  renderPlayer(ctx: CanvasRenderingContext2D, context: ModeContext, cameraX: number, cameraY: number): void {
    const { player, blockSize } = context;
    // The collision box stays 0.5 blocks wide, while the original 64px
    // player art is rendered at its natural height-based visual width.
    const width = blockSize * 1.9;
    const height = blockSize * 1.9;
    const x = (player.x - cameraX) * blockSize + ctx.canvas.width / 2 - width / 2;
    const y = (cameraY - player.y) * blockSize + ctx.canvas.height / 2 - height;
    const image = player.velocityX ? this.move[player.animationFrame()] : this.stand;
    if (image.complete && image.naturalWidth) {
      ctx.save();
      if (player.facing < 0) { ctx.translate(x + width, 0); ctx.scale(-1, 1); ctx.drawImage(image, 0, y, width, height); }
      else ctx.drawImage(image, x, y, width, height);
      ctx.restore();
      return;
    }
    ctx.fillStyle = "#52a8d9";
    ctx.fillRect(x, y, width, height);
  }

  private loadImage(src: string): HTMLImageElement {
    const image = new Image();
    image.src = src;
    return image;
  }
}
