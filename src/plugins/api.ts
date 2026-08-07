import type {BlockType} from "../core/types";
import type {Block, BlockDefinition} from "../core/block";
import type {Player} from "../core/player";
import type {World} from "../core/world";
import type {WorldMeta} from "../core/types";
import type {MobKind} from "../core/entity";
import {blockRegistry, Blocks, GameModes, Registries} from "../core/registry";

export type {Block, BlockDefinition};

export interface GamePlugin {
    id: string;
    name: string;
    version?: string;
    authors?: string[];
    description?: string;
    website?: string;

    install(api: PluginApi): void;
}

export interface ChatMessageOptions {
    color?: string;
}

export interface TitleMessageOptions {
    color?: string;
    subtitle?: string;
    subtitleColor?: string;
    duration?: number;
}

export interface PlayerMessages {
    chat(text: string, options?: ChatMessageOptions): void;
    title(title: string, options?: TitleMessageOptions): void;
}

export interface PluginGameContext {
    username: string;
    meta: WorldMeta;
    world: World;
    player: Player;
    mode: string;
    spectate: boolean;
    flying: boolean;
    messages: PlayerMessages;
}

export interface PluginTickContext extends PluginGameContext {
    dt: number;
}

export interface PluginBlockContext extends PluginGameContext {
    x: number;
    y: number;
    type: BlockType;
}

export interface PluginModeContext extends PluginGameContext {
    previousMode: string;
    mode: string;
}

export interface PluginSpectateContext extends PluginGameContext {
    spectate: boolean;
}

export interface PluginFlyContext extends PluginGameContext {
    flying: boolean;
}

export interface PluginMobContext extends PluginGameContext {
    kind: MobKind;
    x: number;
    y: number;
}

export interface PluginPlayerHurtContext extends PluginGameContext {
    amount: number;
    health: number;
}

export interface PluginApi {
    /** Namespace assigned from the plugin manifest id. */
    readonly namespace: string;
    readonly Blocks: typeof Blocks;
    readonly GameModes: typeof GameModes;
    readonly Registries: typeof Registries;
    readonly messages: PlayerMessages;

    /** Registers a block under this plugin's namespace unless id is fully qualified. */
    registerBlock(definition: BlockDefinition): BlockDefinition;

    getBlock(id: BlockType): BlockDefinition | undefined;

    block(id: BlockType): BlockDefinition;

    /** Creates a fully qualified id in this plugin's namespace. */
    id(path: string): BlockType;

    /** Resolves a file contained in this plugin package. */
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

    onGameStop(listener: (context: PluginGameContext & { reason: string }) => void): void;

    onSpectateChanged(listener: (context: PluginSpectateContext) => void): void;

    onFlyChanged(listener: (context: PluginFlyContext) => void): void;

    onMobKilled(listener: (context: PluginMobContext) => void): void;

    onPlayerHurt(listener: (context: PluginPlayerHurtContext) => void): void;
}

export class PluginRegistry implements PluginApi {
    readonly blocks = new Map<BlockType, BlockDefinition>();
    readonly plugins = new Map<string, GamePlugin>();
    readonly namespace = "my2dworld";
    readonly Blocks = Blocks;
    readonly GameModes = GameModes;
    readonly Registries = Registries;
    private messageTarget: PlayerMessages | null = null;
    readonly messages: PlayerMessages = {
        chat: (text, options) => this.messageTarget?.chat(text, options),
        title: (title, options) => this.messageTarget?.title(title, options),
    };
    private readonly worldCreatedListeners: Array<(world: World) => void> = [];
    private readonly listeners = new Map<string, Array<(context: never) => void>>();

    use(plugin: GamePlugin): void {
        if (!plugin.id || !plugin.name) throw new Error("Plugin requires id and name");
        const namespace = this.normalizeNamespace(plugin.id);
        if (plugin.id !== namespace) throw new Error(`Plugin id must use lowercase underscores: ${plugin.id}`);
        if (this.plugins.has(namespace)) throw new Error(`Plugin already registered: ${namespace}`);
        plugin.install(this.apiFor(namespace));
        this.plugins.set(namespace, plugin);
    }

    registerBlock(definition: BlockDefinition): BlockDefinition {
        return this.registerBlockFor(this.namespace, definition);
    }

    private registerBlockFor(namespace: string, definition: BlockDefinition): BlockDefinition {
        if (definition.id.includes(":") && !definition.id.startsWith(`${namespace}:`)) throw new Error(`Plugin ${namespace} cannot register outside its namespace: ${definition.id}`);
        const registered = blockRegistry.register({...definition, namespace});
        this.blocks.set(registered.id, registered);
        return registered;
    }

    getBlock(id: BlockType): BlockDefinition | undefined {
        return blockRegistry.get(id);
    }

    block(id: BlockType): BlockDefinition {
        const def = blockRegistry.get(id);
        if (!def) throw new Error(`Unknown block: ${id}`);
        return def;
    }

    id(path: string): BlockType {
        return blockRegistry.id(path, this.namespace);
    }

    asset(path: string): string {
        return this.assetFor(this.namespace, path);
    }

    private assetFor(namespace: string, path: string): string {
        const clean = path.replace(/^\/+/, "");
        if (!clean || clean.split("/").some((part) => part === "." || part === "..")) throw new Error(`Invalid plugin asset path: ${path}`);
        return `/plugins/${encodeURIComponent(namespace)}/${clean.split("/").map(encodeURIComponent).join("/")}`;
    }

    private apiFor(namespace: string): PluginApi {
        return {
            namespace,
            Blocks: this.Blocks,
            GameModes: this.GameModes,
            Registries: this.Registries,
            messages: this.messages,
            registerBlock: (definition) => this.registerBlockFor(namespace, definition),
            getBlock: (id) => this.getBlock(id),
            block: (id) => this.block(id),
            id: (path) => blockRegistry.id(path, namespace),
            asset: (path) => this.assetFor(namespace, path),
            onWorldCreated: (listener) => this.onWorldCreated(listener),
            onGameStart: (listener) => this.onGameStart(listener),
            onGameTick: (listener) => this.onGameTick(listener),
            onGamePause: (listener) => this.onGamePause(listener),
            onGameResume: (listener) => this.onGameResume(listener),
            onBlockBroken: (listener) => this.onBlockBroken(listener),
            onBlockPlaced: (listener) => this.onBlockPlaced(listener),
            onPlayerRespawn: (listener) => this.onPlayerRespawn(listener),
            onGameModeChanged: (listener) => this.onGameModeChanged(listener),
            onGameStop: (listener) => this.onGameStop(listener),
            onSpectateChanged: (listener) => this.onSpectateChanged(listener),
            onFlyChanged: (listener) => this.onFlyChanged(listener),
            onMobKilled: (listener) => this.onMobKilled(listener),
            onPlayerHurt: (listener) => this.onPlayerHurt(listener),
        };
    }

    private normalizeNamespace(id: string): string {
        return id.replace(/-/g, "_").toLowerCase();
    }

    setMessageTarget(target: PlayerMessages | null): void {
        this.messageTarget = target;
    }

    onWorldCreated(listener: (world: World) => void): void {
        this.worldCreatedListeners.push(listener);
    }

    notifyWorldCreated(world: World): void {
        this.worldCreatedListeners.forEach((listener) => this.invoke(() => listener(world)));
    }

    onGameStart(listener: (context: PluginGameContext) => void): void {
        this.on("gameStart", listener);
    }

    onGameTick(listener: (context: PluginTickContext) => void): void {
        this.on("gameTick", listener);
    }

    onGamePause(listener: (context: PluginGameContext) => void): void {
        this.on("gamePause", listener);
    }

    onGameResume(listener: (context: PluginGameContext) => void): void {
        this.on("gameResume", listener);
    }

    onBlockBroken(listener: (context: PluginBlockContext) => void): void {
        this.on("blockBroken", listener);
    }

    onBlockPlaced(listener: (context: PluginBlockContext) => void): void {
        this.on("blockPlaced", listener);
    }

    onPlayerRespawn(listener: (context: PluginGameContext) => void): void {
        this.on("playerRespawn", listener);
    }

    onGameModeChanged(listener: (context: PluginModeContext) => void): void {
        this.on("gameModeChanged", listener);
    }

    onGameStop(listener: (context: PluginGameContext & { reason: string }) => void): void {
        this.on("gameStop", listener);
    }

    onSpectateChanged(listener: (context: PluginSpectateContext) => void): void {
        this.on("spectateChanged", listener);
    }

    onFlyChanged(listener: (context: PluginFlyContext) => void): void {
        this.on("flyChanged", listener);
    }

    onMobKilled(listener: (context: PluginMobContext) => void): void {
        this.on("mobKilled", listener);
    }

    onPlayerHurt(listener: (context: PluginPlayerHurtContext) => void): void {
        this.on("playerHurt", listener);
    }

    notifyGameStart(context: PluginGameContext): void {
        this.emit("gameStart", context);
    }

    notifyGameTick(context: PluginTickContext): void {
        this.emit("gameTick", context);
    }

    notifyGamePause(context: PluginGameContext): void {
        this.emit("gamePause", context);
    }

    notifyGameResume(context: PluginGameContext): void {
        this.emit("gameResume", context);
    }

    notifyBlockBroken(context: PluginBlockContext): void {
        this.emit("blockBroken", context);
    }

    notifyBlockPlaced(context: PluginBlockContext): void {
        this.emit("blockPlaced", context);
    }

    notifyPlayerRespawn(context: PluginGameContext): void {
        this.emit("playerRespawn", context);
    }

    notifyGameModeChanged(context: PluginModeContext): void {
        this.emit("gameModeChanged", context);
    }

    notifyGameStop(context: PluginGameContext & { reason: string }): void {
        this.emit("gameStop", context);
    }

    notifySpectateChanged(context: PluginSpectateContext): void {
        this.emit("spectateChanged", context);
    }

    notifyFlyChanged(context: PluginFlyContext): void {
        this.emit("flyChanged", context);
    }

    notifyMobKilled(context: PluginMobContext): void {
        this.emit("mobKilled", context);
    }

    notifyPlayerHurt(context: PluginPlayerHurtContext): void {
        this.emit("playerHurt", context);
    }

    private on<T>(name: string, listener: (context: T) => void): void {
        this.listeners.set(name, [...(this.listeners.get(name) || []), listener as (context: never) => void]);
    }

    private emit<T>(name: string, context: T): void {
        (this.listeners.get(name) || []).forEach((listener) => this.invoke(() => listener(context as never)));
    }

    private invoke(callback: () => void): void {
        try {
            callback();
        } catch (error) {
            console.error("Plugin lifecycle listener failed", error);
        }
    }
}
