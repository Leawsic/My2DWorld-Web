/**
 * My2DWorld 插件 API 类型定义。
 *
 * 插件 .mjs 文件在顶部添加以下行即可获得 IDE 自动补全：
 *
 *   /// <reference path="./my2dworld-plugin-api.d.ts" />
 *
 * 这样 `api.Blocks.DIRT`、`context.player.x`、`context.world.getBlock(x, y)` 等
 * 都会被 IDE 识别为真实游戏对象并支持补全
 */

/** 方块类型 id。 */
declare type BlockType = string;

/** 游戏模式 id。 */
declare type GameModeName = "creative" | "spectator";

/** 方块类型定义（注册表中的共享对象）。 */
declare interface BlockDefinition {
    readonly id: BlockType;
    readonly namespace?: string;
    readonly path?: string;
    readonly texture?: string;
    readonly color: string;
    readonly label: { readonly zh: string; readonly en: string };
    readonly solid?: boolean;
    readonly transparent?: boolean;
}

/** 运行时方块实例（世界中具体某个位置的方块）。 */
declare class Block {
    readonly definition: BlockDefinition;
    readonly id: BlockType;
    readonly x: number;
    readonly y: number;
    readonly color: string;
    readonly label: { readonly zh: string; readonly en: string };
    readonly solid: boolean;
    readonly transparent: boolean;
    constructor(definition: BlockDefinition, x?: number, y?: number);
    displayName(language: "zh" | "en"): string;
    at(x: number, y: number): Block;
}

/** 玩家对象。 */
declare class Player {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    onGround: boolean;
    flying: boolean;
    health: number;
    facing: number;
    update(keys: KeyState, dt: number, world: World): void;
    reset(x: number, y: number): void;
    setPosition(x: number, y: number): void;
    setFlying(flying: boolean): void;
    animationFrame(): number;
}

/** 世界对象。 */
declare class World {
    readonly chunks: ReadonlyMap<number, Chunk>;
    readonly brokenBlocks: ReadonlySet<string>;
    readonly placedBlocks: ReadonlyMap<string, Block>;
    readonly seed: number;
    static cell(x: number, y: number): string;
    static parseCell(cell: string): [number, number];
    getChunk(x: number): Chunk | null;
    getBlock(x: number, y: number): Block | null;
    getBlockId(x: number, y: number): BlockType | null;
    breakBlock(x: number, y: number): Block | null;
    placeBlock(x: number, y: number, type: BlockType | Block): boolean;
    getSurfaceHeight(x: number): number;
    updateView(cameraX: number): void;
    serializeChanges(): {
        brokenBlocks: [number, number][];
        placedBlocks: [number, number, BlockType][];
    };
}

/** 区块对象。 */
declare class Chunk {
    readonly x: number;
    readonly start: number;
    readonly blocks: ReadonlyMap<string, Block>;
    readonly surfaces: ReadonlyMap<number, number>;
    getBlock(cell: string): Block | null;
}

/** 注册表对象基类。 */
declare interface RegistryObject {
    readonly id: string;
}

/** 读取命名空间：任意大小写的 id 都能解析到对应对象。 */
declare interface RegistryNamespace<T extends RegistryObject> {
    readonly [key: string]: T;
}

/** 本体方块常量。 */
declare interface CoreBlocksNamespace extends RegistryNamespace<BlockDefinition> {
    readonly GRASS_BLOCK_SIDE: BlockDefinition;
    readonly DIRT: BlockDefinition;
    readonly STONE: BlockDefinition;
    readonly COBBLESTONE: BlockDefinition;
    readonly MOSSY_COBBLESTONE: BlockDefinition;
    readonly BEDROCK: BlockDefinition;
    readonly COAL_BLOCK: BlockDefinition;
    readonly IRON_BLOCK: BlockDefinition;
    readonly GOLD_BLOCK: BlockDefinition;
    readonly DIAMOND_BLOCK: BlockDefinition;
    readonly COAL_ORE: BlockDefinition;
    readonly IRON_ORE: BlockDefinition;
    readonly GOLD_ORE: BlockDefinition;
    readonly DIAMOND_ORE: BlockDefinition;
    readonly EMERALD_ORE: BlockDefinition;
    readonly LAPIS_ORE: BlockDefinition;
    readonly REDSTONE_ORE: BlockDefinition;
    readonly COPPER_ORE: BlockDefinition;
    readonly DEEPSLATE_COAL_ORE: BlockDefinition;
    readonly DEEPSLATE_IRON_ORE: BlockDefinition;
    readonly DEEPSLATE_GOLD_ORE: BlockDefinition;
    readonly DEEPSLATE_DIAMOND_ORE: BlockDefinition;
    readonly DEEPSLATE_EMERALD_ORE: BlockDefinition;
    readonly DEEPSLATE_LAPIS_ORE: BlockDefinition;
    readonly DEEPSLATE_REDSTONE_ORE: BlockDefinition;
    readonly DEEPSLATE_COPPER_ORE: BlockDefinition;
    readonly RAW_IRON_BLOCK: BlockDefinition;
    readonly RAW_GOLD_BLOCK: BlockDefinition;
    readonly NETHER_QUARTZ_ORE: BlockDefinition;
    readonly NETHER_GOLD_ORE: BlockDefinition;
    readonly IRON_BARS: BlockDefinition;
    readonly IRON_CHAIN: BlockDefinition;
}

/** 方块注册表。内容按 namespace 分组。 */
declare interface BlocksNamespace extends RegistryNamespace<BlockDefinition> {
    readonly MY2DWORLD: CoreBlocksNamespace;
}

/** 游戏模式注册表。 */
declare interface GameModesNamespace extends RegistryNamespace<{ readonly id: GameModeName; readonly label: { readonly zh: string; readonly en: string } }> {
    readonly CREATIVE: { readonly id: "creative"; readonly label: { readonly zh: string; readonly en: string } };
    readonly SPECTATOR: { readonly id: "spectator"; readonly label: { readonly zh: string; readonly en: string } };
}

/** 按键状态。 */
declare interface KeyState {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    jump: boolean;
    sneak: boolean;
}

/** 世界元数据。 */
declare interface WorldMeta {
    readonly id: string;
    readonly name: string;
    readonly mode: GameModeName;
    readonly physics: {
        walkSpeed: number;
        flySpeed: number;
        jumpVelocity: number;
        gravity: number;
    };
    readonly createdAt: string;
    readonly seed?: number;
}

/** 玩家消息选项。 */
declare interface ChatMessageOptions {
    color?: string;
}

declare interface TitleMessageOptions {
    color?: string;
    subtitle?: string;
    subtitleColor?: string;
    duration?: number;
}

declare interface PlayerMessages {
    chat(text: string, options?: ChatMessageOptions): void;
    title(title: string, options?: TitleMessageOptions): void;
}

/** 生命周期上下文。 */
declare interface PluginGameContext {
    readonly username: string;
    readonly meta: WorldMeta;
    readonly world: World;
    readonly player: Player;
    readonly mode: string;
    readonly spectate: boolean;
    readonly flying: boolean;
    readonly messages: PlayerMessages;
}

declare interface PluginTickContext extends PluginGameContext {
    readonly dt: number;
}

declare interface PluginBlockContext extends PluginGameContext {
    readonly x: number;
    readonly y: number;
    readonly type: BlockType;
}

declare interface PluginModeContext extends PluginGameContext {
    readonly previousMode: string;
    readonly mode: string;
}

declare interface PluginSpectateContext extends PluginGameContext {
    readonly spectate: boolean;
}

declare interface PluginFlyContext extends PluginGameContext {
    readonly flying: boolean;
}

/** 插件 manifest。 */
declare interface GamePlugin {
    readonly id: string;
    readonly name: string;
    readonly version?: string;
    readonly authors?: string[];
    readonly description?: string;
    readonly website?: string;
    install(api: PluginApi): void;
}

/** 插件可用的 API。 */
declare interface PluginApi {
    /** This plugin's namespace, derived from its manifest id. */
    readonly namespace: string;
    readonly Blocks: BlocksNamespace;
    readonly GameModes: GameModesNamespace;
    readonly messages: PlayerMessages;

    registerBlock(definition: BlockDefinition): BlockDefinition;
    getBlock(id: BlockType): BlockDefinition | undefined;
    block(id: BlockType): BlockDefinition;
    id(path: string): BlockType;
    asset(path: string): string;

    onWorldCreated(listener: (world: World) => void): void;
    onGameStart(listener: (context: PluginGameContext) => void): void;
    onGameTick(listener: (context: PluginTickContext) => void): void;
    onGamePause(listener: (context: PluginGameContext) => void): void;
    onGameResume(listener: (context: PluginGameContext) => void): void;
    onBlockBroken(listener: (context: PluginBlockContext) => void): void;
    onBlockPlaced(listener: (context: PluginBlockContext) => void): void;
    onPlayerRespawn(listener: (context: PluginGameContext) => void): void;
    onGameModeChanged(listener: (context: PluginModeContext) => void): void;
    onGameStop(listener: (context: PluginGameContext & { readonly reason: string }) => void): void;
    onSpectateChanged(listener: (context: PluginSpectateContext) => void): void;
    onFlyChanged(listener: (context: PluginFlyContext) => void): void;
}
