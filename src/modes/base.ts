import type { KeyState, Player } from "../core/player";
import type { World } from "../core/world";
import type { BlockType, GameModeName } from "../core/types";

export interface ModeContext {
  player: Player;
  world: World;
  keys: KeyState;
  mouseDown: boolean;
  hovered: [number, number, BlockType] | null;
  blockSize: number;
  dt: number;
  textures: ReadonlyMap<string, HTMLImageElement>;
}

export abstract class GameMode {
  abstract readonly name: GameModeName;
  abstract update(context: ModeContext): void;
  renderPlayer(_ctx: CanvasRenderingContext2D, _context: ModeContext, _cameraX: number, _cameraY: number): void {}
}
