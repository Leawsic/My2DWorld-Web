# 指令文档（Commands）

本页面介绍 2DMC 游戏中可用的全部聊天指令。按 `T`（或配置的聊天键）打开聊天框，输入 `/` 开头的内容即为指令。

## 聊天与补全

- 按 `Tab` 循环补全：先补全命令本身，再按参数补全（参数有候选时）。
- 鼠标悬停候选块会高亮，点击即可补全。
- 输入框内有语法高亮：`/` 金色、已知命令浅金、数字蓝色、已知参数绿色。
- 打开聊天框时按 `↑`/`↓` 浏览历史，`PageUp`/`PageDown` 滚动聊天记录。

---

## /gamemode

切换游戏模式。

```
/gamemode <creative|survival|adventure|spectator>
```

| 参数 | 说明 |
| --- | --- |
| `creative` | 创造模式：可飞行、放置/破坏方块、攻击生物；**免疫一切伤害，仅虚空坠落会扣血并重生** |
| `survival` | 生存模式：不能飞行；会受伤、受挤压/虚空伤害；挖方块掉落自身、放置消耗物品、工具耗耐久 |
| `adventure` | 冒险模式：规则与生存模式完全一致（受伤、不飞行、放置消耗方块、工具耗耐久、掉落物），**但不能破坏方块**——按住左键挖方块没有裂纹、不掉落、不耗耐久；点击生物仍按手持武器结算伤害 |
| `spectator` | 旁观模式：幽灵视角，不参与物理与伤害 |

- 模式图标（`public/assets/gui/gamemode/*.png`）会显示在右上角、切换模式的提示文字左侧。
- `F3+F4` 按 创造 → 生存 → 冒险 → 旁观 的顺序循环切换。
- 模式会随存档保存（重进保留），创建世界时也可以直接选择冒险模式。

示例：`/gamemode spectator`、`/gamemode adventure`

---

## /speed（别名 /movespeed）

设置玩家水平移动速度（步行速度），影响移动与飞行。

```
/speed <数值>
```

- 范围：`0.1` ~ `50`，默认 `1.8`。
- 同时写入当前世界元数据与玩家设置（持久化，重进保留）。
- 设置里的「移动速度」与指令等价，二者会互相覆盖。

示例：`/speed 5`

---

## /debug

开关调试信息（F3 同款数据面板）。

```
/debug <on|off|true|false>
```

- 值写入设置 `debugDefault`，下次进入游戏沿用。
- 聊天内以 `/debug on` 打开，或按 `F3` 切换。

示例：`/debug on`

---

## /aggro

设置敌对生物（僵尸/尸壳/溺尸）发现玩家并开始追击的水平距离。

```
/aggro <数值>
```

- 范围：`1` ~ `128` 格，默认 `24`。
- 持久化到设置。数值越大，敌对生物越早发现你。

示例：`/aggro 40`

---

## /seed

显示当前世界的种子号。

```
/seed
```

示例：`/seed` → `Seed: 123456789`

---

## /tick

控制游戏速度（客户端 tick 速率）。**20 tick/秒 = 正常速度**，一整天（20 分钟）等所有世界时间都按这个速率缩放。

```
/tick                                    # 查看当前 tick 速率与冻结状态
/tick rate <1-200>                       # 设置 tick 速率（20 = 正常）
/tick rate normal                        # 等价于 /tick rate 20
/tick <1-200>                            # 等价于 /tick rate <n>
/tick freeze [on|off]                    # 冻结 / 解冻世界（on/off 缺省为冻结）
/tick unfreeze                           # 解冻（等价于 /tick freeze off）
/tick step [n]                           # 冻结后单步推进 n 个 tick（默认 1）
```

| 参数 | 说明 |
| --- | --- |
| `<1-200>` | 每秒模拟的 tick 数，夹紧到 1~200 的整数；`20` = 1 倍速、`40` = 2 倍速、`10` = 半速、`200` = 10 倍速、`1` = 1/20 速 |
| `freeze` | 冻结世界推进：生物、流体、掉落物、昼夜时刻、自动保存全部停住，只保留渲染与输入（`Esc` 菜单、聊天仍可用） |
| `step [n]` | 仅在冻结状态下有效；排队推进 n 个 tick（每 tick = 1/速率 秒），逐帧补跑，最多一次排队 2000 tick |

- 速率与冻结状态只作用于当前会话，不写入存档；重进世界恢复 20 tick/秒。
- 倍速实现方式：一帧要模拟的秒数 = 真实帧时长 × (速率 / 20)，再拆成**不超过 1/20 秒**的子步逐个模拟——所以任何倍速下的单步物理都与正常速度一致，不会因为 10 倍速就穿墙。
- 速率非 20 或世界被冻结时，`F3` 面板左上角生命条右侧会显示当前 tick 状态；`F3` 面板的「tick」一行也会显示。
- 相关：`/time cycle off` 只冻结时刻，`/tick freeze` 冻结整个世界。

示例：

```
/tick 40            # 2 倍速
/tick freeze        # 暂停世界，观察生物/流体
/tick step 20       # 单步推进 20 tick（= 1 秒游戏时间）
/tick unfreeze      # 恢复
```

---

## /time

查看或设置当天时刻，以及开关昼夜循环。一整天 = 现实 20 分钟（`src/core/daylight.ts` 的 `DAY_LENGTH_SECONDS`）。

```
/time                                  # 查看当前时刻 / 昼夜循环 / 环境光照
/time set <0-24|day|noon|night|midnight|sunrise|sunset>
/time add <小时>
/time cycle <on|off>
/time <day|noon|night|midnight|sunrise|sunset>   # 等价于 /time set <预设>
```

| 参数 | 说明 |
| --- | --- |
| `set <0-24>` | 设为指定小时（支持小数，如 `6.5` = 06:30）；`0` = 午夜、`12` = 正午 |
| `set sunrise` | 06:00（日出） |
| `set day` | 09:00（上午） |
| `set noon` | 12:00（正午） |
| `set sunset` | 18:00（日落） |
| `set night` | 21:00（夜晚） |
| `set midnight` | 00:00（午夜） |
| `add <小时>` | 在当前时刻上加上若干小时（可为负、可超过 24，自动按一天取模） |
| `cycle on\|off` | 开关昼夜循环：关闭后时刻冻结，天空与光照停在当前时刻（`Esc` → 设置 里也有这一项） |

- 设置时刻后立即持久化到当前世界存档；重进世界会从保存的时刻继续。
- 与光照相关的现象：正午最亮、午夜最暗，日出/日落有暖色霞光与平滑过渡；夜里能看到星空与月亮。
- 时刻也会显示在 `F3` 调试面板的「时间」一行。

示例：

```
/time set noon      # 直接调到正午
/time add -3        # 往回拨 3 小时
/time cycle off     # 冻结时间，安心建筑
/time               # 查看当前状态
```

---

## /locate

定位最近的目标生物群系并传送过去。

```
/locate <生物群系>
```

可定位的生物群系：`plains`、`forest`、`desert`、`snowy`、`mountains`、`ocean`、`river`。

- 从玩家位置向两侧扫描（最大 ±20000 格），命中即传送并显示坐标。
- 未找到时提示「Could not locate …」。

示例：`/locate ocean`

---

## /tp

传送玩家到指定坐标（整数坐标，X 向下取整并落在方块中心）。

```
/tp <x> [y]
```

- `x`：目标 X（整数，实际传送到 `x+0.5` 的方块中心）。
- `y`：可选的目标 Y；缺省时自动落到目标列的地表高度。
- **Tab 补全坐标**：输入 `/tp` 后按 `Tab` 会自动补全你当前所在的坐标（整数）；
  已有 X 时再按 `Tab` 补全当前 Y。

示例：`/tp 100`、`/tp 100 64`

---

## /summon

在指定位置生成生物。

```
/summon <生物种类> [数量]
/summon <生物种类> <x> <y> [数量]
```

| 参数 | 说明 |
| --- | --- |
| `生物种类` | 生物 ID（见下方列表），可 Tab 补全 |
| `数量` | 可选，`1`~`64`，默认 `1`；**只有一个数字参数时视为数量**，在默认位置（玩家面前 1.5 格）生成一排 |
| `x`、`y` | 可选坐标；指定坐标时第一个数字为 x、第二个为 y，第三个数字才是数量 |

可召唤的生物（随 `/reload hitboxes` 的 `public/hitboxes/*.json` 自动适配碰撞箱）：

- 僵尸系：`zombie`、`zombie_baby`、`husk`、`husk_baby`、`drowned`、`drowned_baby`
- 猪系：`pig_cold`、`pig_cold_baby`、`pig_temperate`、`pig_temperate_baby`、`pig_warm`、`pig_warm_baby`
- 牛系：`cow_cold`、`cow_temperate`、`cow_warm`、`mooshroom_red`、`mooshroom_brown`
- 幼年牛：`cow_cold_baby`、`cow_temperate_baby`、`cow_warm_baby`、`mooshroom_red_baby`、`mooshroom_brown_baby`

召唤的生物不会因距离而消失（区别于自然生成的生物）。

示例：`/summon cow_temperate_baby`、`/summon zombie 10`（默认位置生成 10 只）、`/summon zombie 100 64 10`（指定位置生成 10 只）

---

## /give

给予本地玩家方块或物品（工具）。

```
/give [<targets>] <方块|物品> [数量]
```

| 参数 | 说明 |
| --- | --- |
| `<targets>` | 可选玩家目标选择器：`@p`（最近玩家）、`@a`（全部玩家）、`@r`（随机玩家）、玩家名；本游戏为单机，全部指向本地玩家。默认为 `@p` |
| `<方块\|物品>` | 方块/物品 ID，可省略 `my2dworld:` 前缀，也支持插件方块；可 Tab 补全 |
| `数量` | 可选，默认 `1`；上限是该物品的单格堆叠上限（方块 64，工具 1） |

- 物品先并入背包中同 ID 未满的格子（单格上限见 `public/items/items.json` 的 `stackSize`），再放入空格。
- 背包全满时，放不下的部分会作为掉落物丢在玩家脚下，可走近捡回。
- 标记了 `cannot_give` 的方块（水、岩浆等不可携带方块）**无法给予**，Tab 补全列表中也不会出现。
- 工具（镐/斧/剑/锹/锄）来自 `public/items/items.json`，**给出时是满耐久**；耐久、挖掘速度与伤害都由该文件配置。

示例：`/give dirt`、`/give grass_block 64`、`/give diamond_pickaxe`、`/give netherite_sword`

工具 ID 一览（`<材质>_<工具>`，材质为 `wooden`/`stone`/`copper`/`iron`/`golden`/`diamond`/`netherite`，工具为 `pickaxe`/`axe`/`sword`/`shovel`/`hoe`，共 35 件）：

```
/give wooden_pickaxe      # 木镐：挖掘速度 2、伤害 2、耐久 59
/give diamond_axe         # 钻石斧：挖掘速度 8、伤害 9、耐久 1561
/give netherite_sword     # 下界合金剑：伤害 8、耐久 2031
/give iron_shovel         # 铁锹
/give stone_hoe           # 石锄
```

- 手持对口工具才有挖掘加速：镐→石头/矿石/深板岩，斧→原木，锹→草方块/泥土/沙子/雪，锄→树叶；拿错类别（拿剑挖石头）与空手同速。
- 挖掘耗时 = 方块硬度 / 工具速度（例：石头硬度 4 → 空手 4 秒、木镐 2 秒、钻石镐 0.5 秒）。
- 生存模式下每挖掉一格 / 命中一次生物消耗 1 点耐久，归零时工具损坏消失；创造模式不消耗耐久。

---

## /kill

杀死玩家、清除生物或掉落物。

```
/kill [<targets>]
```

| 目标 | 作用 |
| --- | --- |
| 缺省或 `@p` / `@a` / `@r` / 玩家名 | 杀死本地玩家（立即重生到重生点 / 世界出生点） |
| `@e` | 清除全部生物与全部掉落物 |
| 生物 ID（如 `zombie`、`pig_temperate`） | 清除该种生物（可 Tab 补全） |
| `items` | 清除所有掉落物 |

- `/kill` 清除生物时不触发死亡播报。
- 掉落物落地后会自动清理：最长存在约 300 秒。

示例：`/kill`、`/kill @e`、`/kill zombie`、`/kill items`

---

## /clearchat

清空聊天框（含历史消息，仅清除显示，不影响设置与存档）。

```
/clearchat
```

示例：`/clearchat`

---

## /spawnpoint

设置玩家死亡后的重生点（MC 风格）。

```
/spawnpoint [<targets>] [<pos>] [<facing>]
```

| 参数 | 说明 |
| --- | --- |
| `<targets>` | 玩家目标选择器：`@p`（最近玩家）、`@a`（全部玩家）、`@r`（随机玩家）、玩家名；本游戏为单机，全部指向本地玩家。默认为 `@p` |
| `<pos>` | 二维坐标 `<x> <y>`：绝对坐标（如 `100 64`）、相对坐标（`~ ~` 表示命令执行点，即当前位置）、偏移相对坐标（`~5 ~-3` 表示当前位置偏移） |
| `<facing>` | 可选：重生时的面朝方向，`left` 或 `right`；缺省保持死亡前的朝向 |

- 重生点持久化到世界存档，重新进入游戏仍生效。
- 未设置重生点时，死亡回落到世界出生点。
- 例：`/spawnpoint`（当前位置）、`/spawnpoint @p ~ ~`、`/spawnpoint 100 64 left`、`/spawnpoint @a ~5 ~-3 right`

示例：`/spawnpoint 100 64 right`

---

## /fill

批量填充一个矩形区域。

```
/fill <x1> <y1> <x2> <y2> <方块> [方块状态] [模式]
/fill <x1> <y1> <x2> <y2> <方块> [方块状态] replace [被替换方块] [被替换方块状态]
```

| 参数 | 说明 |
| --- | --- |
| `x1 y1 x2 y2` | 两组对角坐标定义矩形区域；坐标顺序不影响结果，内部始终从较小坐标开始。支持绝对坐标与 `~` 相对坐标（`~` = 玩家位置，`~5 ~-3` = 偏移）；局部坐标 `^` 暂不支持 |
| `方块` | 方块 ID（可省略 `my2dworld:` 前缀，也支持插件方块）；`air` 表示清空该格 |
| `方块状态` | `key=value` 形式，如 `level=3`、`falling=true`（目前水/岩浆使用 `level`、`falling`） |

填充模式（缺省 `replace`）：

| 模式 | 2D 行为 |
| --- | --- |
| `replace` | 替换矩形内所有方块（默认，无需显式写出）。带过滤时仅替换匹配的方块 |
| `keep` | 仅替换空气方块，非空气方块保留 |
| `destroy` | 替换所有方块，原非空气且非 `cannot_give`（不可携带）方块以掉落物形式释放 |
| `hollow` | 仅替换矩形边界上的方块，内部保持不变 |
| `outline` | 仅替换矩形内部紧贴边界的方块，边界本身不替换（至少 3×3 才有效果） |

`replace` 过滤：`replace <被替换方块> [被替换方块状态]`，仅替换匹配的方块。

- 成功时返回 `已填充 N 个方块`。
- 失败情形：区域体积超过 `32768`（256×128）、坐标超出世界竖直边界（Y 为 `-64`~`319`）、方块 ID 无效。

关于水：

- `/fill <x1> <y1> <x2> <y2> water` 生成水源方块（`level=0, falling=false`）。
- `/fill <x1> <y1> <x2> <y2> water level=3` 生成流动水（level=3，非水源）。
- 填充完成后会立即触发一次水的传播更新：水源左右各流动最多 7 格（每格 level+1），正下方为空气时向下落；非水源的流动水会在供给水源被移除后于下个传播周期消失。
- 水与岩浆相邻时，岩浆源转黑曜石、流动岩浆转圆石。
- 水与岩浆被标记为 `cannot_give`（不可携带）：`/give`、掉落、中键复制都不会获取它们，但 `/fill` 仍可放置。

示例：`/fill 0 60 10 70 water`、`/fill 0 0 10 10 water level=3`、`/fill 100 64 110 70 stone replace dirt`、`/fill ~-5 ~ ~5 ~ air`

---

## /structure

保存与放置自定义结构（两阶段：先标记范围，再 `confirm` 提交）。

```
/structure export <名称> [宽] [高]
/structure export confirm
/structure load <名称> [锚点x]
/structure load confirm
/structure list
/structure delete <名称>
```

- `export`：以玩家所在列为中心、地表为底部，标记 `宽×高`（各 1~64，默认 16×8）
  的区域为待导出范围；执行 `export confirm` 后保存为结构。
- `load`：预载结构并标记放置位置（默认以玩家所在列为锚点，可指定锚点 x）；
  执行 `load confirm` 后放置方块。
- `list`：列出已保存的结构。
- `delete`：删除指定名称的结构。

结构名称限字母、数字、`-` 与 `_`（最多 32 字符）。

示例：`/structure export myhouse 20 10` → `/structure export confirm`

---

## /reload

就地刷新资源与配置，无需刷新页面。

```
/reload [images|items|animations|hitboxes|squeeze|plugins|all]
```

| 目标 | 刷新内容 |
| --- | --- |
| `images` | 方块/物品/生物群系/GUI/角色贴图缓存 |
| `items` | 重新读取 `public/items/items.json`（工具的挖掘速度/伤害/耐久/堆叠上限），并刷新物品贴图 |
| `animations` | 角色动画（`.myanim`）清单与变体缓存 |
| `hitboxes` | 生物碰撞箱配置（`public/hitboxes/*.json`），并应用到已存在的生物 |
| `squeeze` | 挤压箱几何（`public/squeeze/*.json`）与挤压参数（`run/config/squeeze.json`），并应用到已存在的生物 |
| `plugins` | 卸载并重装全部插件，同时刷新插件注册的碰撞箱到现有生物 |
| `all` | 以上全部（缺省值） |

示例：`/reload hitboxes`、`/reload items`（改完物品配置不用重开页面）

---

## 相关快捷键

- `T`（或配置键）：打开聊天；`/`：直接以 `/` 打开聊天。
- `F3`：调试信息（含当前时间与环境光照、tick 速率、主手物品与耐久）；`F4`：切换模式（配合 `F3` 按 创造 → 生存 → 冒险 → 旁观 循环）；`F5`：碰撞箱/范围可视化；`F7`：旁观；`F11`：全屏。
- 昼夜与环境光照的开关在 `Esc` → `设置` 里的「昼夜循环」与「环境光照」两行。
- 游戏速度用 `/tick`（20 tick/秒 = 正常速度）。
