// 灵魂出窍（spectate）核心规则：出窍时的视角移动范围与钳制工具。
// 状态本身由 GameSession 持有，本模块只提供纯规则，供游戏逻辑与插件系统共用。

/** 出窍视角相对玩家身体的最大偏移（格）。 */
export const SPECTATE_LIMIT = 32;

/** 将视角偏移钳制到 [ -SPECTATE_LIMIT, SPECTATE_LIMIT ] 范围内。 */
export function clampSpectateOffset(offsetX: number, offsetY: number): [number, number] {
  return [
    Math.max(-SPECTATE_LIMIT, Math.min(SPECTATE_LIMIT, offsetX)),
    Math.max(-SPECTATE_LIMIT, Math.min(SPECTATE_LIMIT, offsetY)),
  ];
}
