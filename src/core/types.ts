export type GameModeName = "spectator" | "creative";
export type Language = "zh" | "en";
export type BlockType = string;

export interface MovementSettings {
  walkSpeed: number;
  flySpeed: number;
  jumpVelocity: number;
  gravity: number;
}

export interface WorldMeta {
  id: string;
  name: string;
  mode: GameModeName;
  physics: MovementSettings;
  createdAt: string;
}

export interface WorldSave {
  playerX: number;
  playerY: number;
  mode: GameModeName;
  brokenBlocks: [number, number][];
  placedBlocks: [number, number, BlockType][];
}

export interface PlayerSettings {
  language: Language;
  fullscreen: boolean;
  debugDefault: boolean;
  keyBindings: KeyBindings;
  movement: MovementSettings;
}

export interface KeyBindings {
  left: string;
  right: string;
  up: string;
  down: string;
  jump: string;
  debug: string;
  mode: string;
  chat: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  jump: "Space",
  debug: "F3",
  mode: "F4",
  chat: "KeyT",
};

export const DEFAULT_MOVEMENT: MovementSettings = {
  walkSpeed: 1.8,
  flySpeed: 3.5,
  jumpVelocity: 9.5,
  gravity: 14,
};

export const DEFAULT_SETTINGS: PlayerSettings = {
  language: "zh",
  fullscreen: false,
  debugDefault: true,
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  movement: { ...DEFAULT_MOVEMENT },
};
