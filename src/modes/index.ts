import {CreativeMode} from "./creative";
import {SpectatorMode} from "./spectator";
import type {GameMode} from "./base";
import {GameModes} from "../core/registry";

export function createMode(name: string): GameMode {
    return name === GameModes.CREATIVE.id ? new CreativeMode() : new SpectatorMode();
}
