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
    seed?: number;
}

export interface WorldSave {
    playerX: number;
    playerY: number;
    mode: GameModeName;
    idTable: string[];
    chunks: Record<string, string>;
}

export interface PlayerSettings {
    language: Language;
    fullscreen: boolean;
    debugDefault: boolean;
    keyBindings: KeyBindings;
    movement: MovementSettings;
    autosaveInterval: number;
    cursorStyle: "crosshair" | "default";
    placementAlpha: number;
    placementBrightness: number;
    spectateAlpha: number;
    spectateBrightness: number;
    /** 生物仇恨（敌对生物开始走向玩家）的距离，格。 */
    aggroRange: number;
    /** 聊天与命令的字体大小（px）。 */
    chatFontSize: number;
}

export interface KeyBindings {
    left: string;
    right: string;
    up: string;
    down: string;
    jump: string;
    debug: string;
    mode: string;
    hitbox: string;
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
    hitbox: "F5",
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
    keyBindings: {...DEFAULT_KEY_BINDINGS},
    movement: {...DEFAULT_MOVEMENT},
    autosaveInterval: 300,
    cursorStyle: "default",
    placementAlpha: 0.5,
    placementBrightness: 0.75,
    spectateAlpha: 0.5,
    spectateBrightness: 0.75,
    aggroRange: 24,
    chatFontSize: 13,
};
