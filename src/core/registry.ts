import type {BlockType, GameModeName} from "./types";
import type {BlockDefinition} from "./block";

export interface RegistryObject {
    readonly id: string;
}

export type RegistryNamespace<T extends RegistryObject> = Record<string, T>;

export class Registry<T extends RegistryObject> {
    readonly values = new Map<string, T>();
    readonly namespace: RegistryNamespace<T> = {};

    register(value: T): T {
        if (!value.id) throw new Error("Registry objects require an id");
        if (this.values.has(value.id)) throw new Error(`Object already registered: ${value.id}`);
        this.values.set(value.id, value);
        this.namespace[this.key(value.id)] = value;
        return value;
    }

    get(id: string): T | undefined {
        return this.values.get(id);
    }

    has(id: string): boolean {
        return this.values.has(id);
    }

    list(): readonly T[] {
        return [...this.values.values()];
    }

    private key(id: string): string {
        return id.replace(/[^a-zA-Z0-9_$]/g, "_").toUpperCase();
    }
}

export type BlockObject = BlockDefinition & RegistryObject;

export interface GameModeObject extends RegistryObject {
    readonly id: GameModeName;
    readonly label: { zh: string; en: string };
}

export const blockRegistry = new Registry<BlockObject>();
export const Blocks = blockRegistry.namespace as RegistryNamespace<BlockObject>;

const builtinBlocks: Array<[BlockType, string, string, string]> = [
    ["grass_block_side", "#62a941", "草方块", "Grass Block"],
    ["dirt", "#8d613c", "泥土", "Dirt"],
    ["stone", "#777d82", "石头", "Stone"],
    ["cobblestone", "#626b6d", "圆石", "Cobblestone"],
    ["mossy_cobblestone", "#4c7564", "苔石", "Mossy Cobblestone"],
    ["bedrock", "#33363a", "基岩", "Bedrock"],
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

builtinBlocks.forEach(([id, color, zh, en]) => blockRegistry.register({id, color, label: {zh, en}}));

export const gameModeRegistry = new Registry<GameModeObject>();
export const GameModes = gameModeRegistry.namespace as RegistryNamespace<GameModeObject>;

export const Registries = {
    blocks: blockRegistry,
    gameModes: gameModeRegistry,
} as const;

gameModeRegistry.register({id: "creative", label: {zh: "创造模式", en: "Creative"}});
gameModeRegistry.register({id: "spectator", label: {zh: "旁观模式", en: "Spectator"}});
