import type {BlockType, GameModeName} from "./types";
import type {BlockDefinition} from "./block";

export interface RegistryObject {
    readonly id: string;
    readonly namespace?: string;
    readonly path?: string;
}

export const CORE_NAMESPACE = "my2dworld";

/** Runtime namespaces may contain nested namespace groups or registry objects. */
export type RegistryNamespace<T extends RegistryObject> = Record<string, T>;

/** Proxy-backed namespace that resolves any casing of an id to its object. */
export type RegistryNamespaceProxy<T extends RegistryObject> = Record<string, T> & {
    readonly [key: string]: T;
};

export class Registry<T extends RegistryObject> {
    readonly values = new Map<string, T>();
    readonly namespace: RegistryNamespaceProxy<T>;

    constructor(private readonly namespaced = true) {
        const target = this;
        this.namespace = new Proxy({} as Record<string, T>, {
            get(_, prop: string | symbol): T | undefined {
                if (typeof prop !== "string") return undefined;
                const group = target.namespaced ? target.group(prop) : null;
                if (group) return group as unknown as T;
                const upper = prop.replace(/[^a-zA-Z0-9_$]/g, "_").toUpperCase();
                return target.get(prop) ?? target.values.get(upper) ?? [...target.values.values()].find((value) => target.key(target.namespaced ? value.path || value.id : value.id) === upper && (!target.namespaced || (value.namespace || CORE_NAMESPACE) === CORE_NAMESPACE));
            },
            ownKeys(): Array<string | symbol> {
                const keys = new Set<string>();
                for (const id of target.values.keys()) keys.add(id.replace(/[^a-zA-Z0-9_$]/g, "_").toUpperCase());
                return [...keys];
            },
            getOwnPropertyDescriptor(_t: Record<string, T>, prop: string | symbol): PropertyDescriptor | undefined {
                if (typeof prop !== "string") return undefined;
                const upper = prop.replace(/[^a-zA-Z0-9_$]/g, "_").toUpperCase();
                const value = target.values.get(prop) ?? target.values.get(upper) ?? [...target.values.values()].find((entry) => entry.id.replace(/[^a-zA-Z0-9_$]/g, "_").toUpperCase() === upper);
                if (!value) return undefined;
                return {configurable: true, enumerable: true, value, writable: false};
            },
        }) as RegistryNamespaceProxy<T>;
    }

    register(value: T): T {
        if (!value.id) throw new Error("Registry objects require an id");
        if (!this.namespaced) {
            if (this.values.has(value.id)) throw new Error(`Object already registered: ${value.id}`);
            this.values.set(value.id, value);
            return value;
        }
        const [namespace, path] = this.parts(value.id, value.namespace ?? CORE_NAMESPACE);
        const id = `${namespace}:${path}`;
        if (this.values.has(id)) throw new Error(`Object already registered: ${id}`);
        const registered = {...value, id, namespace, path} as T;
        this.values.set(id, registered);
        return registered;
    }

    get(id: string, defaultNamespace = CORE_NAMESPACE): T | undefined {
        if (!this.namespaced) return this.values.get(id);
        const [namespace, path] = this.parts(id, defaultNamespace);
        return this.values.get(`${namespace}:${path}`);
    }

    /** Returns all objects owned by a namespace. */
    inNamespace(namespace: string): readonly T[] {
        const normalized = namespace.toLowerCase();
        return this.list().filter((value) => value.namespace === normalized);
    }

    has(id: string): boolean {
        return !!this.get(id);
    }

    list(): readonly T[] {
        return [...this.values.values()];
    }

    id(path: string, namespace = CORE_NAMESPACE): string {
        if (!this.namespaced) return path;
        return this.parts(path, namespace).join(":");
    }

    private parts(id: string, defaultNamespace: string): [string, string] {
        const separator = id.indexOf(":");
        const namespace = separator < 0 ? defaultNamespace : id.slice(0, separator);
        const path = separator < 0 ? id : id.slice(separator + 1);
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(namespace) || !/^[a-z0-9][a-z0-9_/-]*$/i.test(path)) throw new Error(`Invalid resource id: ${id}`);
        return [namespace.replace(/-/g, "_").toLowerCase(), path.replace(/-/g, "_").toLowerCase()];
    }

    private key(id: string): string {
        return id.replace(/[^a-zA-Z0-9_$]/g, "_").toUpperCase();
    }

    private group(namespace: string): RegistryNamespaceProxy<T> | null {
        if (!this.namespaced) return null;
        const normalized = namespace.replace(/-/g, "_").toLowerCase();
        if (![...this.values.values()].some((value) => (value.namespace || CORE_NAMESPACE) === normalized)) return null;
        return new Proxy({} as Record<string, T>, {
            get: (_, prop: string | symbol) => typeof prop === "string" ? this.get(`${normalized}:${prop}`) : undefined,
        }) as RegistryNamespaceProxy<T>;
    }
}

export type BlockObject = BlockDefinition & RegistryObject;

export interface GameModeObject extends RegistryObject {
    readonly id: GameModeName;
    readonly label: { zh: string; en: string };
}

export const blockRegistry = new Registry<BlockObject>();
/** Dynamic resource namespace, for example Blocks.MY2DWORLD.DIRT. */
export const Blocks: Record<string, any> = blockRegistry.namespace;

const builtinBlocks: Array<[BlockType, string, string, string]> = [
    ["grass_block", "#62a941", "草方块", "Grass Block"],
    ["oak_log", "#6b5533", "橡木原木", "Oak Log"],
    ["oak_leaves", "#4c7a34", "橡树树叶", "Oak Leaves"],
    ["short_grass", "#7aad3f", "草丛", "Short Grass"],
    ["poppy", "#c9302c", "虞美人", "Poppy"],
    ["dandelion", "#e8c83a", "蒲公英", "Dandelion"],
    ["sand", "#d7c98a", "沙子", "Sand"],
    ["snow", "#eef4f8", "雪块", "Snow"],
    ["cactus", "#5b7a3a", "仙人掌", "Cactus"],
    ["dirt", "#8d613c", "泥土", "Dirt"],
    ["stone", "#777d82", "石头", "Stone"],
    ["cobblestone", "#626b6d", "圆石", "Cobblestone"],
    ["mossy_cobblestone", "#4c7564", "苔石", "Mossy Cobblestone"],
    ["bedrock", "#33363a", "基岩", "Bedrock"],
    ["deepslate", "#41454a", "深板岩", "Deepslate"],
    ["coal_block", "#252525", "煤炭块", "Block of Coal"],
    ["iron_block", "#d5d5d5", "铁块", "Block of Iron"],
    ["gold_block", "#e0b52d", "金块", "Block of Gold"],
    ["diamond_block", "#55d6d0", "钻石块", "Block of Diamond"],
    ["coal_ore", "#555555", "煤矿石", "Coal Ore"],
    ["iron_ore", "#927d6b", "铁矿石", "Iron Ore"],
    ["gold_ore", "#c5a35a", "金矿石", "Gold Ore"],
    ["diamond_ore", "#55b9b6", "钻石矿石", "Diamond Ore"],
    ["emerald_ore", "#42b879", "绿宝石矿石", "Emerald Ore"],
    ["lapis_ore", "#4166ae", "青金石矿石", "Lapis Lazuli Ore"],
    ["redstone_ore", "#a94332", "红石矿石", "Redstone Ore"],
    ["copper_ore", "#b9785f", "铜矿石", "Copper Ore"],
    ["deepslate_coal_ore", "#41484c", "深层煤矿石", "Deepslate Coal Ore"],
    ["deepslate_iron_ore", "#6f665f", "深层铁矿石", "Deepslate Iron Ore"],
    ["deepslate_gold_ore", "#9e834c", "深层金矿石", "Deepslate Gold Ore"],
    ["deepslate_diamond_ore", "#3f9290", "深层钻石矿石", "Deepslate Diamond Ore"],
    ["deepslate_emerald_ore", "#327d5c", "深层绿宝石矿石", "Deepslate Emerald Ore"],
    ["deepslate_lapis_ore", "#344f83", "深层青金石矿石", "Deepslate Lapis Lazuli Ore"],
    ["deepslate_redstone_ore", "#73382f", "深层红石矿石", "Deepslate Redstone Ore"],
    ["deepslate_copper_ore", "#805747", "深层铜矿石", "Deepslate Copper Ore"],
    ["raw_iron_block", "#a88f7c", "粗铁块", "Block of Raw Iron"],
    ["raw_gold_block", "#b99642", "粗金块", "Block of Raw Gold"],
    ["nether_quartz_ore", "#d8d0c4", "下界石英矿石", "Nether Quartz Ore"],
    ["nether_gold_ore", "#a98738", "下界金矿石", "Nether Gold Ore"],
    ["iron_bars", "#8d9696", "铁栏杆", "Iron Bars"],
    ["iron_chain", "#777c7c", "铁链", "Iron Chain"],
];

/** Non-default collision / rendering flags for blocks that need them. */
const BLOCK_FLAGS: Record<string, {solid?: boolean; transparent?: boolean}> = {
    oak_leaves: {solid: true, transparent: true},
    short_grass: {solid: false, transparent: true},
    poppy: {solid: false, transparent: true},
    dandelion: {solid: false, transparent: true},
};

builtinBlocks.forEach(([id, color, zh, en]) => blockRegistry.register({id, color, label: {zh, en}, ...BLOCK_FLAGS[id]}));

export const gameModeRegistry = new Registry<GameModeObject>(false);
export const GameModes: Record<string, any> = gameModeRegistry.namespace;

export const Registries = {
    blocks: blockRegistry,
    gameModes: gameModeRegistry,
} as const;

gameModeRegistry.register({id: "creative", label: {zh: "创造模式", en: "Creative"}});
gameModeRegistry.register({id: "spectator", label: {zh: "旁观模式", en: "Spectator"}});
