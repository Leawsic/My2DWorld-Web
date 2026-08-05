import {CreativeMode} from "./creative";
import {SpectatorMode} from "./spectator";
import type {GameMode} from "./base";

export function createMode(name: string): GameMode {
    return name === "creative" ? new CreativeMode() : new SpectatorMode();
}
