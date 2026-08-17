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
    readonly GRASS_BLOCK: BlockDefinition;
    readonly OAK_LOG: BlockDefinition;
    readonly OAK_LEAVES: BlockDefinition;
    readonly SHORT_GRASS: BlockDefinition;
    readonly POPPY: BlockDefinition;
    readonly DANDELION: BlockDefinition;
    readonly SAND: BlockDefinition;
    readonly SNOW: BlockDefinition;
    readonly CACTUS: BlockDefinition;
    readonly DIRT: BlockDefinition;
    readonly STONE: BlockDefinition;
    readonly COBBLESTONE: BlockDefinition;
    readonly MOSSY_COBBLESTONE: BlockDefinition;
    readonly BEDROCK: BlockDefinition;
    readonly DEEPSLATE: BlockDefinition;
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

declare interface PluginMobContext extends PluginGameContext {
    readonly kind: MobKind;
    readonly x: number;
    readonly y: number;
}

declare interface PluginPlayerHurtContext extends PluginGameContext {
    readonly amount: number;
    readonly health: number;
}

/** 实体（mob）类型 id。 */
declare type MobKind =
    | "zombie" | "zombie_baby" | "husk" | "husk_baby" | "drowned" | "drowned_baby"
    | "pig_cold" | "pig_cold_baby" | "pig_temperate" | "pig_temperate_baby" | "pig_warm" | "pig_warm_baby"
    | "cow_cold" | "cow_temperate" | "cow_warm" | "mooshroom_red" | "mooshroom_brown";

/** 碰撞箱分类：大/小 × 牛/猪/僵尸。注册分类 key 会覆盖整个分类的所有 kind 变体（如 `cow` 覆盖全部成年牛与哞菇）。 */
declare type HitboxCategory = "cow" | "cow_baby" | "pig" | "pig_baby" | "zombie" | "zombie_baby";

/** 碰撞箱覆盖配置（半宽/高度为方块，centerX/centerY 为箱中心相对锚点的偏移）。默认 centerY = height/2（脚底锚定），省略时物理碰撞/点击判定与 F5 可视化共用同一碰撞箱。 */
declare interface HitboxConfig {
    readonly halfWidth: number;
    readonly height: number;
    readonly centerX?: number;
    readonly centerY?: number;
}

/** 动画模板家族：覆盖该家族所有 kind 变体。 */
declare type AnimationFamily = "player" | "zombie" | "cow" | "pig";

/** 动画姿态。 */
declare type AnimationPose = "idle" | "walk" | "attack";

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
    readonly Registries: { readonly blocks: Registry<BlockDefinition>; readonly gameModes: Registry<{ readonly id: GameModeName; readonly label: { readonly zh: string; readonly en: string } }> };
    readonly messages: PlayerMessages;

    registerBlock(definition: BlockDefinition): BlockDefinition;
    getBlock(id: BlockType): BlockDefinition | undefined;
    block(id: BlockType): BlockDefinition;
    id(path: string): BlockType;
    asset(path: string): string;

    /** Overrides the hitbox of a mob kind or a whole category (cow/cow_baby/pig/pig_baby/zombie/zombie_baby). Exact kind beats category; plugin config beats public/hitboxes files. */
    registerHitbox(kind: MobKind | HitboxCategory, config: HitboxConfig): void;
    /** Overrides hitboxes for multiple kinds/categories at once. */
    setHitboxes(configs: Record<string, HitboxConfig>): void;
    /**
     * Registers a template animation for an animation family + pose (for example
     * "cow" + "walk"), overriding the built-in file animation for every kind in
     * that family. `url` is usually produced by `asset(...)`. Resolves false on
     * load failure.
     */
    registerAnimation(family: AnimationFamily, pose: AnimationPose, url: string): Promise<boolean>;

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
    onMobKilled(listener: (context: PluginMobContext) => void): void;
    onPlayerHurt(listener: (context: PluginPlayerHurtContext) => void): void;
}

declare interface Registry<T extends RegistryObject> {
    readonly values: ReadonlyMap<string, T>;
    register(value: T): T;
    get(id: string, defaultNamespace?: string): T | undefined;
    inNamespace(namespace: string): readonly T[];
    has(id: string): boolean;
    list(): readonly T[];
    id(path: string, namespace?: string): string;
}
