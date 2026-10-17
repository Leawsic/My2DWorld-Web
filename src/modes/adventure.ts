import {SurvivalMode} from "./survival";
import {GameModes} from "../core/registry";
import type {GameModeName} from "../core/types";

/**
 * 冒险模式：与生存模式完全一致（受伤、不飞行、放置消耗方块、工具耐久、攻击伤害、掉落物），
 * 唯一区别是**不能破坏方块**——按住左键挖方块不会有裂纹、不会掉落、不消耗耐久；
 * 点击生物仍然按手持武器结算伤害。因此直接继承 `SurvivalMode`，只关掉 `canMine`。
 */
export class AdventureMode extends SurvivalMode {
    readonly name: GameModeName = GameModes.ADVENTURE.id;
    protected readonly canMine = false;
}
