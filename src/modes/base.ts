import type {KeyState, Player} from "../core/player";
import type {World} from "../core/world";
import type {BlockType, GameModeName} from "../core/types";
import type {MobManager} from "../core/entity";

export interface ModeContext {
    player: Player;
    world: World;
    keys: KeyState;
    mouseDown: boolean;
    hovered: [number, number, BlockType] | null;
    /** Cursor position in world coordinates (mouse may be over air). */
    mouseWorld: [number, number] | null;
    mobs: MobManager;
    blockSize: number;
    dt: number;
    textures: ReadonlyMap<string, HTMLImageElement | HTMLCanvasElement>;
    /** 取某方块在 x 列的生物群系染色贴图（草方块/树叶/短草按群系着色）；缺省回落 raw textures。 */
    blockTextureAt?: (type: BlockType, x: number) => HTMLImageElement | HTMLCanvasElement | undefined;
    onBlockBroken?: (x: number, y: number, type: BlockType) => void;
    onPlayerDamage?: (amount: number) => void;
}

export abstract class GameMode {
    abstract readonly name: GameModeName;

    abstract update(context: ModeContext): void;

    renderPlayer(_ctx: CanvasRenderingContext2D, _context: ModeContext, _cameraX: number, _cameraY: number): void {
    }

    /** 在方块层之后、实体层之前绘制的模式特效（粒子/挖掘裂纹等）；默认无。 */
    renderEffects(_ctx: CanvasRenderingContext2D, _cameraX: number, _cameraY: number, _blockSize: number): void {
    }
}
