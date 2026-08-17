// .myanim 文件动画引擎（移植自 My2DWorld-animation/player.js，TS 版）。
// 与播放器版本保持同一套坐标系与变换链：
//   对象坐标 = 世界坐标（y 向上），原点在对象锚点；image/rect 的 w/h 在局部 y-down 空间绘制。

export interface AnimPoint {
    mode?: "ratio" | "local" | "world";
    x?: number;
    y?: number;
}

export type AnimNodeDef = AnimPoint | [number, number];
export type AnimPivot = AnimPoint | [number, number];

export interface AnimObject {
    id?: string;
    type?: "rect" | "circle" | "image" | "text";
    color?: string;
    text?: string;
    size?: number;
    font?: string;
    align?: string;
    image?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    opacity?: number;
    pivot?: AnimPivot;
    nodes?: Record<string, AnimNodeDef>;
    attach?: {
        target: string;
        node?: string;
        inheritAngle?: boolean;
        inheritAngleOffset?: number;
    };
    inheritAngle?: string | {target: string; offset?: number};
    face?: {target: string; node?: string; offset?: number};
    scale?: number | [number, number];
    layer?: number;
    motion?: AnimMotion;
}

export interface AnimMotion {
    translate?: {
        mode?: string;
        dx?: number;
        dy?: number;
        loop?: boolean;
        cx?: number;
        cy?: number;
        radius?: number;
        revolutions?: number;
        frequency?: number;
        phase?: number;
    };
    rotate?: {
        angle?: number;
        loop?: boolean;
        offset?: number;
        phase?: number;
    };
    relation?: string;
    segments?: Array<AnimMotion & {duration?: number}>;
}

export interface AnimDef {
    name?: string;
    duration?: number;
    width?: number;
    height?: number;
    background?: string;
    objects?: AnimObject[];
}

export interface AnimTransform {
    x: number;
    y: number;
    angle: number;
    nodes: Record<string, {x: number; y: number}>;
    pivotLocal: [number, number];
}

export interface AnimDrawOptions {
    alpha?: number;
    brightness?: number;
    tint?: string;
    tintAmount?: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
/** 周期相位偏移：p 为当前相位 0..1，s 为偏移（0~1，0.5 即反相），结果归一到 [0,1)。 */
const pshift = (p: number, s = 0): number => {
    const value = (p + (Number(s) || 0)) % 1;
    return value < 0 ? value + 1 : value;
};
/** 旋转中心局部坐标：pivot 数组=[比例]；对象可 mode=ratio|local|world（ox/oy 为对象初始位置，world 模式基准）。 */
function pivotLocalOf(pdef: AnimPivot | undefined, w: number, h: number, ox = 0, oy = 0): [number, number] {
    if (!pdef) return [w * 0.5, h * 0.5];
    if (Array.isArray(pdef)) return [pdef[0] * w, pdef[1] * h];
    const pm = pdef.mode || "ratio";
    if (pm === "world") return [w / 2 + ((pdef.x ?? 0) - ox), h / 2 - ((pdef.y ?? 0) - oy)];
    if (pm === "local") return [w / 2 + (pdef.x ?? 0), h / 2 - (pdef.y ?? 0)];
    return [(pdef.x ?? 0) * w, (pdef.y ?? 0) * h];
}

export class Animation {
    readonly images = new Map<string, HTMLImageElement>();
    private readonly byId = new Map<string, AnimObject>();
    private readonly objects: AnimObject[] = [];
    private _tx: Map<string, AnimTransform> | null = null;
    private _computing = new Set<string>();
    private readonly imageTransform?: (url: string) => string;
    private boundsCache: { t: number; x: number; y: number; w: number; h: number } | null = null;

    constructor(readonly def: AnimDef, readonly baseUrl = "", imageTransform?: (url: string) => string) {
        this.imageTransform = imageTransform;
        this.objects = def.objects ?? [];
        for (const obj of this.objects) {
            if (obj.id) this.byId.set(obj.id, obj);
            if (obj.type === "image" && obj.image) {
                const img = new Image();
                let src = new URL(obj.image, baseUrl || location.href).href;
                if (this.imageTransform) src = this.imageTransform(src);
                img.src = src;
                this.images.set(obj.id ?? obj.image, img);
            }
        }
    }

    /** 重新创建所有部件图片（带缓存爆破），用于 /reload 图片刷新。 */
    invalidateImages(): void {
        for (const obj of this.objects) {
            if (obj.type !== "image" || !obj.image) continue;
            const img = new Image();
            let src = new URL(obj.image, this.baseUrl || location.href).href;
            if (this.imageTransform) src = this.imageTransform(src);
            const separator = src.includes("?") ? "&" : "?";
            img.src = `${src}${separator}t=${Date.now()}`;
            this.images.set(obj.id ?? obj.image, img);
        }
        this.boundsCache = null;
    }

    get duration(): number {
        return Math.max(0.001, this.def.duration ?? 1);
    }

    /** 对象实际尺寸：image 未显式指定 w/h 时用图片自身尺寸（加载完成后生效），否则默认 50。 */
    sizeOf(obj: AnimObject): [number, number] {
        let w = obj.w, h = obj.h;
        if ((w == null || h == null) && obj.type === "image") {
            const img = obj.id ? this.images.get(obj.id) : undefined;
            if (img && img.complete && img.naturalWidth) {
                if (w == null) w = img.naturalWidth;
                if (h == null) h = img.naturalHeight;
            }
        }
        return [w ?? 50, h ?? 50];
    }

    /** 计算整份动画在时刻 t 的世界空间包围盒（y 向上）；未加载成功的 image 对象不参与。 */
    boundsAt(t: number): { x: number; y: number; w: number; h: number } | null {
        if (this.boundsCache && Math.abs(this.boundsCache.t - t) < 1e-6) return this.boundsCache;
        this._tx = new Map();
        this._computing = new Set();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const obj of this.objects) {
            if (obj.type === "image") {
                const img = obj.id ? this.images.get(obj.id) : undefined;
                if (!img || !img.complete || !img.naturalWidth) continue;
            }
            const [w, h] = this.sizeOf(obj);
            const tr = this.transformOf(obj, t);
            if (obj.id) this._tx.set(obj.id, tr);
            const [plx, ply] = tr.pivotLocal;
            const rr = tr.angle * Math.PI / 180;
            const c = Math.cos(rr), s = Math.sin(rr);
            const corners: ReadonlyArray<readonly [number, number]> = [[0, 0], [w, 0], [0, h], [w, h]];
            for (const [lx, ly] of corners) {
                const d = lx - plx, e = ply - ly;
                const wx = tr.x + d * c + e * s;
                const wy = tr.y - d * s + e * c;
                if (wx < minX) minX = wx;
                if (wy < minY) minY = wy;
                if (wx > maxX) maxX = wx;
                if (wy > maxY) maxY = wy;
            }
        }
        this._tx = null;
        this._computing.clear();
        if (!Number.isFinite(minX)) return null;
        const bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        this.boundsCache = { t, ...bounds };
        return bounds;
    }

    private resolve(id: string, t: number): AnimTransform | undefined {
        let result: AnimTransform | undefined = this._tx?.get(id);
        if (!result) {
            const tobj = this.byId.get(id);
            if (tobj && !this._computing.has(id)) {
                this._computing.add(id);
                result = this.transformOf(tobj, t);
                this._computing.delete(id);
                if (result && this._tx) this._tx.set(id, result);
            }
        }
        return result;
    }

    /** 计算对象在时刻 t 的位置与旋转。主调用也登记防环标记（递归解析时跳过自身）。 */
    transformOf(obj: AnimObject, t: number): AnimTransform {
        const wasComputing = !!(obj.id && this._computing.has(obj.id));
        if (obj.id) this._computing.add(obj.id);
        try {
            return this.transformOfImpl(obj, t);
        } finally {
            if (obj.id && !wasComputing) this._computing.delete(obj.id);
        }
    }

    private transformOfImpl(obj: AnimObject, t: number): AnimTransform {
        const dur = this.duration;
        const m = obj.motion || {};

        // ---- 多段式动画：定位当前段（segments），段内相位 = 段内时间/段时长 ----
        let phase = (t % dur) / dur;
        let segM = m;
        const segs = m.segments;
        if (segs && segs.length) {
            const tIn = t % dur;
            const durs = segs.map((s) => Math.max(0.001, Number(s.duration) || 0));
            let acc = 0, idx = segs.length - 1;
            for (let i = 0; i < segs.length; i++) {
                if (tIn < acc + durs[i]) {
                    idx = i;
                    break;
                }
                acc += durs[i];
            }
            const segT = Math.min(Math.max(tIn - acc, 0), durs[idx]);
            phase = segT / durs[idx];
            segM = segs[idx] || {};
        }
        const tr = segM.translate || {};
        const rot = segM.rotate || {};
        const tph = pshift(phase, tr.phase);
        const rph = pshift(phase, rot.phase);

        // ---- 旋转中心（pivot）解析：数组=[比例]；对象可 mode=ratio|local|world ----
        const [w, h] = this.sizeOf(obj);
        const pivotLocal = pivotLocalOf(obj.pivot, w, h, obj.x ?? 0, obj.y ?? 0);

        // ---- attach：预解析目标对象（与定义顺序无关，递归解析；_computing 防循环）----
        let attachTgt: AnimTransform | null = null;
        if (obj.attach && this._tx) {
            attachTgt = this.resolve(obj.attach.target, t) ?? null;
        }

        // ---- 位置与速度方向 ----
        let px = obj.x ?? 0, py = obj.y ?? 0;
        let vx = 0, vy = 0;
        const mode = tr.mode || "linear";
        if (mode === "circle") {
            const rev = tr.revolutions ?? 1;
            const a = tph * Math.PI * 2 * rev;
            const cx = tr.cx ?? px, cy = tr.cy ?? py, r = tr.radius ?? 100;
            px = cx + Math.cos(a) * r;
            py = cy + Math.sin(a) * r;
            vx = -Math.sin(a) * r;
            vy = Math.cos(a) * r;
        } else if (mode === "sine") {
            const f = (tr.frequency ?? 1) * Math.PI * 2;
            const ax = tr.dx ?? 0, ay = tr.dy ?? 0;
            const s = Math.sin(tph * f);
            px = (obj.x ?? 0) + ax * s;
            py = (obj.y ?? 0) + ay * s;
            vx = ax * Math.cos(tph * f) * f;
            vy = ay * Math.cos(tph * f) * f;
        } else { // linear：0->1->0 往返
            const dx = tr.dx ?? 0, dy = tr.dy ?? 0;
            const forward = tph * 2 <= 1;
            const u = tr.loop === false ? tph : (forward ? tph * 2 : 2 - tph * 2);
            px = (obj.x ?? 0) + dx * u;
            py = (obj.y ?? 0) + dy * u;
            vx = dx * (forward ? 1 : -1);
            vy = dy * (forward ? 1 : -1);
        }

        // ---- 旋转 ----
        const rotForward = rph * 2 <= 1;
        const ru = rot.loop === false ? rph : (rotForward ? rph * 2 : 2 - rph * 2);
        const baseAngle = (rot.offset ?? 0) + (rot.angle ?? 0) * ru;
        const dir = Math.atan2(vy, vx) * 180 / Math.PI;
        const rel = segM.relation || "independent";
        let angle: number;
        switch (rel) {
            // dir 是世界系角（y 向上）；屏幕系（y 向下）角为其相反数，故 follow 取 -dir
            case "follow":
                angle = -dir;
                break;
            case "reverse":
                angle = 180 - dir;
                break;
            case "orbit":
                angle = baseAngle + (mode === "circle" ? 180 - tph * 360 * (tr.revolutions ?? 1) : 0);
                break;
            default:
                angle = baseAngle;
        }

        // ---- attach：位置 = 目标节点世界坐标 ----
        if (attachTgt) {
            const nd = attachTgt.nodes && obj.attach?.node ? attachTgt.nodes[obj.attach.node] : undefined;
            if (nd) {
                px = nd.x;
                py = nd.y;
            } else {
                console.warn("attach: 目标「" + obj.attach?.target + "」没有节点「" + (obj.attach?.node ?? "") + "」");
            }
        } else if (obj.attach) {
            console.warn("attach: 找不到目标对象「" + obj.attach.target + "」（未定义或存在循环绑定）");
        }

        // ---- face：朝向目标节点（覆盖 rotation，类似 follow 但朝向指定点）----
        if (obj.face) {
            const ftgt = obj.face.target ? this.resolve(obj.face.target, t) : undefined;
            if (!ftgt) {
                console.warn("face: 找不到目标对象「" + obj.face.target + "」（未定义或存在循环绑定）");
            } else {
                const fnd = ftgt.nodes && obj.face.node ? ftgt.nodes[obj.face.node] : undefined;
                if (fnd) {
                    // 世界方向 (dx,dy)（y 向上）→ 屏幕角取其相反数
                    angle = -Math.atan2(fnd.y - py, fnd.x - px) * 180 / Math.PI + (obj.face.offset ?? 0);
                } else {
                    console.warn("face: 目标「" + obj.face.target + "」没有节点「" + (obj.face.node ?? "") + "」");
                }
            }
        }

        // ---- inheritAngle：朝向与目标对象保持一致（覆盖 rotate/face），支持 offset 角度偏移 ----
        let inhFrom: string | null = null;
        let inhOffset = 0;
        if (obj.attach && obj.attach.inheritAngle === true) {
            inhFrom = obj.attach.target;
            inhOffset = Number(obj.attach.inheritAngleOffset) || 0;
        } else if (typeof obj.inheritAngle === "string") {
            inhFrom = obj.inheritAngle;
        } else if (obj.inheritAngle && typeof obj.inheritAngle === "object") {
            inhFrom = obj.inheritAngle.target;
            inhOffset = Number(obj.inheritAngle.offset) || 0;
        }
        if (inhFrom) {
            const itgt = this.resolve(inhFrom, t);
            if (itgt) angle = itgt.angle + inhOffset;
            else console.warn("inheritAngle: 找不到目标对象「" + inhFrom + "」（未定义或存在循环绑定）");
        }

        // ---- 节点世界坐标：数组=[比例]；对象可 mode=ratio|local|world ----
        const nodes: Record<string, {x: number; y: number}> = {};
        const rr = angle * Math.PI / 180;
        const c = Math.cos(rr), s = Math.sin(rr);
        for (const [name, ndef] of Object.entries(obj.nodes || {})) {
            let wo: [number, number];
            if (Array.isArray(ndef)) {
                const nx = ndef[0] * w, ny = ndef[1] * h;
                wo = [nx - pivotLocal[0], pivotLocal[1] - ny];
            } else {
                const nm = ndef.mode || "ratio";
                if (nm === "world") {
                    wo = [(ndef.x ?? 0) - (obj.x ?? 0), (ndef.y ?? 0) - (obj.y ?? 0)];
                } else if (nm === "local") {
                    const nx = w / 2 + (ndef.x ?? 0), ny = h / 2 - (ndef.y ?? 0);
                    wo = [nx - pivotLocal[0], pivotLocal[1] - ny];
                } else {
                    const nx = (ndef.x ?? 0) * w, ny = (ndef.y ?? 0) * h;
                    wo = [nx - pivotLocal[0], pivotLocal[1] - ny];
                }
            }
            nodes[name] = {x: px + wo[0] * c + wo[1] * s, y: py - wo[0] * s + wo[1] * c};
        }
        return {x: px, y: py, angle, nodes, pivotLocal};
    }

    /** 计算整份动画在时刻 t 的所有对象变换（id → 变换），供姿态混合等场景复用。 */
    transformsAt(t: number): Map<string, AnimTransform> {
        this._tx = new Map();
        this._computing = new Set();
        const result = new Map<string, AnimTransform>();
        for (const obj of this.objects) {
            const tr = this.transformOf(obj, t);
            if (obj.id) {
                this._tx.set(obj.id, tr);
                result.set(obj.id, tr);
            }
        }
        this._tx = null;
        this._computing.clear();
        return result;
    }

    /** 把整份动画在时刻 t 绘制到当前坐标系（对象坐标即世界坐标，y 向上，锚点即原点）。 */
    render(ctx: CanvasRenderingContext2D, t: number, options: AnimDrawOptions = {}): void {
        this._tx = new Map();
        this._computing = new Set();
        const objs = [...this.objects].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
        for (const obj of objs) {
            const tr = this.transformOf(obj, t);
            if (obj.id) this._tx.set(obj.id, tr);
            this.drawObject(ctx, obj, tr, options);
        }
        this._tx = null;
        this._computing.clear();
    }

    /** 按给定变换绘制单个对象（姿态混合渲染时也复用此方法）。 */
    drawObject(ctx: CanvasRenderingContext2D, obj: AnimObject, tr: AnimTransform, options: AnimDrawOptions): void {
        const [w, h] = this.sizeOf(obj);
        ctx.save();
        ctx.translate(tr.x, tr.y);
        ctx.scale(1, -1); // 局部坐标恢复 y 向下：pivot/矩形方向/文字方向语义与播放器一致
        ctx.rotate(tr.angle * Math.PI / 180);
        // 对象局部缩放（绕旋转中心）：必须在 translate(-pl) 之前调用，缩放中心才是旋转中心
        const sc = obj.scale ?? 1;
        const sx = Array.isArray(sc) ? (sc[0] ?? 1) : sc;
        const sy = Array.isArray(sc) ? (sc[1] ?? sx) : sc;
        ctx.scale(sx, sy);
        const pl = tr.pivotLocal || pivotLocalOf(obj.pivot, w, h);
        ctx.translate(-pl[0], -pl[1]);
        ctx.globalAlpha = clamp(obj.opacity ?? 1, 0, 1) * clamp(options.alpha ?? 1, 0, 1);
        const brightness = Math.max(0, options.brightness ?? 1);
        const tint = options.tint;
        const tintAmount = Math.max(0, Math.min(1, options.tintAmount ?? 0));
        const overlay = brightness < 1 || (tint && tintAmount > 0);

        switch (obj.type) {
            case "circle": {
                ctx.fillStyle = obj.color || "#ffffff";
                ctx.beginPath();
                ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                if (overlay) this.overlay(ctx, 0, 0, w, h, brightness, tint, tintAmount);
                break;
            }
            case "image": {
                const img = obj.id ? this.images.get(obj.id) : undefined;
                if (img && img.complete && img.naturalWidth) {
                    ctx.drawImage(img, 0, 0, w, h);
                    if (overlay) this.overlay(ctx, 0, 0, w, h, brightness, tint, tintAmount);
                }
                // 图片未加载成功（加载中/失败）：不绘制（隐藏对象）
                break;
            }
            case "text": {
                ctx.fillStyle = obj.color || "#ffffff";
                ctx.font = (obj.size || 24) + "px " + (obj.font || "Microsoft YaHei, sans-serif");
                ctx.textAlign = (obj.align || "center") as CanvasTextAlign;
                ctx.textBaseline = "middle";
                ctx.fillText(obj.text ?? "", w / 2, h / 2);
                if (overlay) {
                    const tw = ctx.measureText(obj.text ?? "").width;
                    this.overlay(ctx, w / 2 - tw / 2, h / 2 - (obj.size || 24) / 2, tw, obj.size || 24, brightness, tint, tintAmount);
                }
                break;
            }
            default: { // rect
                ctx.fillStyle = obj.color || "#e2bc68";
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = "rgba(255,255,255,.35)";
                ctx.lineWidth = 1;
                ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
                if (overlay) this.overlay(ctx, 0, 0, w, h, brightness, tint, tintAmount);
            }
        }
        ctx.restore();
    }

    /** 在已绘制对象上叠加亮度/染色（source-atop 只影响本对象的像素）。 */
    private overlay(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, brightness: number, tint?: string, tintAmount = 0): void {
        ctx.globalCompositeOperation = "source-atop";
        if (brightness < 1) {
            ctx.globalAlpha = 1 - brightness;
            ctx.fillStyle = "#000";
            ctx.fillRect(x, y, w, h);
        }
        if (tint && tintAmount > 0) {
            ctx.globalAlpha = tintAmount;
            ctx.fillStyle = tint;
            ctx.fillRect(x, y, w, h);
        }
        ctx.globalCompositeOperation = "source-over";
    }
}
