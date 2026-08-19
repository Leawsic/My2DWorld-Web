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
/gamemode <creative|spectator>
```

| 参数 | 说明 |
| --- | --- |
| `creative` | 创造模式：可飞行、放置/破坏方块、攻击生物；**免疫一切伤害，仅虚空坠落会扣血并重生** |
| `spectator` | 旁观模式：幽灵视角，不参与物理与伤害 |

示例：`/gamemode spectator`

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
/reload [images|animations|hitboxes|plugins|all]
```

| 目标 | 刷新内容 |
| --- | --- |
| `images` | 方块/生物群系/GUI/角色贴图缓存 |
| `animations` | 角色动画（`.myanim`）清单与变体缓存 |
| `hitboxes` | 生物碰撞箱配置（`public/hitboxes/*.json`），并应用到已存在的生物 |
| `plugins` | 卸载并重装全部插件，同时刷新插件注册的碰撞箱到现有生物 |
| `all` | 以上全部（缺省值） |

示例：`/reload hitboxes`

---

## 相关快捷键

- `T`（或配置键）：打开聊天；`/`：直接以 `/` 打开聊天。
- `F3`：调试信息；`F4`：切换模式；`F5`：碰撞箱/范围可视化；`F7`：旁观；`F11`：全屏。
