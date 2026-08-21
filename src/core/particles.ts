interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    sprite: HTMLCanvasElement;
    size?: number;
}

export class ParticleSystem {
    private particles: Particle[] = [];

    spawn(x: number, y: number, texture?: HTMLImageElement | HTMLCanvasElement): void {
        for (let i = 0; i < 8; i += 1) {
            const life = 0.36 + Math.random() * 0.36;
            this.particles.push({
                x: x + 0.5,
                y: y - 0.5,
                vx: Math.random() * 6 - 3,
                vy: 0.5 + Math.random() * 6,
                life,
                maxLife: life,
                sprite: this.sample(texture)
            });
        }
    }

    /** Wider, longer-lived burst of the target texture, used for a mob death. */
    burst(x: number, y: number, texture?: HTMLImageElement | HTMLCanvasElement, count = 18, size = 1.5): void {
        for (let i = 0; i < count; i += 1) {
            const life = 0.5 + Math.random() * 0.4;
            this.particles.push({
                x: x + (Math.random() * 1.6 - 0.8),
                y: y + Math.random() * 1.9,
                vx: Math.random() * 9 - 4.5,
                vy: 2 + Math.random() * 8,
                life,
                maxLife: life,
                size,
                sprite: this.sample(texture)
            });
        }
    }

    update(dt: number): void {
        for (const particle of this.particles) {
            particle.vx *= 0.95;
            particle.vy -= 14 * dt;
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            particle.life -= dt;
        }
        this.particles = this.particles.filter((particle) => particle.life > 0);
    }

    render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, size: number): void {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        for (const particle of this.particles) {
            ctx.globalAlpha = particle.life / particle.maxLife;
            const spriteSize = Math.max(4, Math.round((size / 5) * (particle.size ?? 1)));
            const x = Math.round((particle.x - cameraX) * size + cx - spriteSize / 2);
            const y = Math.round((cameraY - particle.y) * size + cy - spriteSize / 2);
            ctx.drawImage(particle.sprite, x, y, spriteSize, spriteSize);
        }
        ctx.globalAlpha = 1;
    }

    private sample(texture?: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
        const sprite = document.createElement("canvas");
        const isImage = !!texture && "naturalWidth" in texture;
        const sourceSize = isImage ? (texture as HTMLImageElement).naturalWidth : (texture as HTMLCanvasElement | undefined)?.width || 8;
        const ready = isImage ? (texture as HTMLImageElement).complete && (texture as HTMLImageElement).naturalWidth > 0 : texture instanceof HTMLCanvasElement;
        const cropSize = Math.max(1, Math.floor(sourceSize / 4));
        sprite.width = cropSize;
        sprite.height = cropSize;
        const ctx = sprite.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        if (ready) {
            const x = Math.floor(Math.random() * (sourceSize - cropSize + 1));
            const y = Math.floor(Math.random() * ((isImage ? (texture as HTMLImageElement).naturalHeight : (texture as HTMLCanvasElement).height) - cropSize + 1));
            ctx.drawImage(texture as CanvasImageSource, x, y, cropSize, cropSize, 0, 0, cropSize, cropSize);
        } else {
            ctx.fillStyle = "#6db84a";
            ctx.fillRect(0, 0, cropSize, cropSize);
        }
        return sprite;
    }
}
