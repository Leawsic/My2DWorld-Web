import type {BlockType, Language} from "./types";

/**
 * 方块携带的 NBT 标签（可扩展）。存于每格方块的附加数据中，覆盖方块定义的默认值。
 * 三层系统约定：
 *  - layer 1（最上面）：会挡路 / 玩家可放置的常规层；
 *  - layer 2（中间）：树叶层，不挡路；
 *  - layer 3（最下面）：木头层，不挡路。
 */
export interface BlockNbt {
    /** 层级（1/2/3），缺省为 1。 */
    layer?: 1 | 2 | 3;
    [key: string]: unknown;
}

export interface BlockDefinition {
    readonly id: BlockType;
    readonly namespace?: string;
    readonly path?: string;
    /** Asset filename without the namespace. Defaults to the block path. */
    readonly texture?: string;
    readonly color: string;
    readonly label: { zh: string; en: string };
    readonly solid?: boolean;
    readonly transparent?: boolean;
    /** 方块类型的默认 NBT（例如树叶 layer:2、木头 layer:3）。 */
    readonly nbt?: BlockNbt;
    /** 地物标记：花/草等需要下方支撑才能放置，且破坏其下方方块时自身不会被破坏。 */
    readonly feature?: boolean;
}

/** A block type placed in a world. Definitions are shared; instances carry position. */
export class Block {
    readonly id: BlockType;
    readonly color: string;
    readonly label: { zh: string; en: string };
    readonly solid: boolean;
    readonly transparent: boolean;
    readonly feature: boolean;
    /** 合并了方块定义默认值与实例覆盖值后的 NBT。 */
    readonly nbt: BlockNbt;

    constructor(readonly definition: BlockDefinition, readonly x = 0, readonly y = 0, nbt?: BlockNbt) {
        this.id = definition.id;
        this.color = definition.color;
        this.label = definition.label;
        this.solid = definition.solid ?? true;
        this.transparent = definition.transparent ?? false;
        this.feature = definition.feature ?? false;
        this.nbt = {...(definition.nbt ?? {}), ...(nbt ?? {})};
    }

    /** 层级（1/2/3），缺省为 1。仅第 1 层会参与碰撞（挡路）。 */
    get layer(): number {
        return this.nbt.layer ?? 1;
    }

    displayName(language: Language): string {
        return this.label[language];
    }

    at(x: number, y: number): Block {
        return new Block(this.definition, x, y, this.nbt);
    }
}
