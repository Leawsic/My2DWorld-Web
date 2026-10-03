import {CreativeMode} from "./creative";
import {SpectatorMode} from "./spectator";
import {SurvivalMode} from "./survival";
import type {GameMode} from "./base";
import {GameModes} from "../core/registry";

export function createMode(name: string): GameMode {
    if (name === GameModes.SURVIVAL.id) return new SurvivalMode();
    return name === GameModes.CREATIVE.id ? new CreativeMode() : new SpectatorMode();
}
