import {GameMode, type ModeContext} from "./base";
import type {GameModeName} from "../core/types";
import {GameModes} from "../core/registry";

export class SpectatorMode extends GameMode {
    readonly name: GameModeName = GameModes.SPECTATOR.id;
    private readonly speed = 4;

    update({player, keys, dt}: ModeContext): void {
        player.x += (Number(keys.right) - Number(keys.left)) * this.speed * dt;
        player.y += (Number(keys.up) - Number(keys.down)) * this.speed * dt;
    }
}
