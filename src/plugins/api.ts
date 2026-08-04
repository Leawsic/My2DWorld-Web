import type { BlockType } from "../core/types";
import type { World } from "../core/world";

export interface BlockDefinition {
  id: BlockType;
  color: string;
  label: { zh: string; en: string };
}

export interface GamePlugin {
  id: string;
  name: string;
  install(api: PluginApi): void;
}

export interface PluginApi {
  registerBlock(definition: BlockDefinition): void;
  onWorldCreated(listener: (world: World) => void): void;
}

export class PluginRegistry implements PluginApi {
  readonly blocks = new Map<BlockType, BlockDefinition>();
  private readonly worldCreatedListeners: Array<(world: World) => void> = [];

  use(plugin: GamePlugin): void {
    plugin.install(this);
  }

  registerBlock(definition: BlockDefinition): void {
    if (this.blocks.has(definition.id)) throw new Error(`Block already registered: ${definition.id}`);
    this.blocks.set(definition.id, definition);
  }

  onWorldCreated(listener: (world: World) => void): void {
    this.worldCreatedListeners.push(listener);
  }

  notifyWorldCreated(world: World): void {
    this.worldCreatedListeners.forEach((listener) => listener(world));
  }
}
