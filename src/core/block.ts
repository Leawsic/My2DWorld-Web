import type {BlockType, Language} from "./types";

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
}

/** A block type placed in a world. Definitions are shared; instances carry position. */
export class Block {
    readonly id: BlockType;
    readonly color: string;
    readonly label: { zh: string; en: string };
    readonly solid: boolean;
    readonly transparent: boolean;

    constructor(readonly definition: BlockDefinition, readonly x = 0, readonly y = 0) {
        this.id = definition.id;
        this.color = definition.color;
        this.label = definition.label;
        this.solid = definition.solid ?? true;
        this.transparent = definition.transparent ?? false;
    }

    displayName(language: Language): string {
        return this.label[language];
    }

    at(x: number, y: number): Block {
        return new Block(this.definition, x, y);
    }
}
