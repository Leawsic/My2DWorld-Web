import type {KeyState, Player} from "../core/player";
import type {World} from "../core/world";
import type {BlockType, GameModeName, ItemStack} from "../core/types";
import type {MobManager} from "../core/entity";
import type {CharacterPose, HeldItemImages} from "../core/skeleton";

/**
 * 攻击姿态（`public/animations/player/attack.myanim`）的播放时长（秒）：
 * 点中生物后播放这么久再回到 walk/idle。挖方块用的是另一条姿态 `dig`（dig.myanim）。
 */
export const ATTACK_POSE_SECONDS = 0.3;

/**
 * 玩家姿态优先级（纯函数，生存/冒险/创造共用，便于单独验证）：
 * 攻击（点中生物 → attack.myanim）> 挖掘（挖方块 → dig.myanim）> 走 > 站。
 * **攻击必须优先于挖掘**：否则手持工具打生物时会错误地播成挖方块的 dig 动画。
 */
export function playerPose(attacking: boolean, mining: boolean, moving: boolean): CharacterPose {
    if (attacking) return "attack";
    if (mining) return "dig";
    return moving ? "walk" : "idle";
}

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
    /** 玩家左右手物品贴图（left=副手，right=主手选中格）；缺省时不覆盖 .myanim 的占位贴图。 */
    itemImages?: HeldItemImages;
    /** 取某点（方块坐标）的环境光 0..1：把角色按所处深度压暗（夜晚 / 洞穴更暗）。 */
    lightAt?: (x: number, y: number) => number;
    /**
     * 主手（当前选中的快捷栏格）堆叠。工具用它换算出挖掘速度倍率与攻击伤害
     * （core/items.ts 的 miningSpeedFor / attackDamageFor）；空手或手持方块时为 null。
     */
    heldItem?: ItemStack | null;
    /**
     * 使用了一次主手工具（挖掉一个方块 / 命中一次生物）：由会话扣 1 点耐久。
     * 只有可消耗耐久的物品会真正被扣（实现方自行判断），创造模式不调用。
     */
    onToolUsed?: (amount: number) => void;
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
