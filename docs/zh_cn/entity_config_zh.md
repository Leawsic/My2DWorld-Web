# 生物碰撞箱与物理挤压配置指南（中文版）

> 适用项目：`D:\Project\My2DWorld-Web`
> 本文说明如何通过 JSON 文件给生物**碰撞箱**（几何/碰撞体积）与**物理挤压**（挤压箱几何 + 挤压伤害参数）**分开配置**。

---

## 1. 核心概念：三份互相独立的配置

| 配置 | 决定什么 | 文件位置（源） |
| --- | --- | --- |
| 碰撞箱 | 生物的体积、能否与方块/其他实体重叠、被推开方向、点击/占用判定、F5 可视化 | `public/hitboxes/*.json` |
| 挤压箱（几何） | 挤压伤害的「重叠检测」用什么盒子、以及「重叠多深才算挤压」的参考尺寸 | `public/squeeze/*.json` |
| 挤压参数（伤害/时长） | 抠多少血、多深触发、无敌帧、单次上限、难度、玩家挤压缩放 | `run/config/squeeze.json` |

三者**互不干扰**：

- 改碰撞箱不会改挤压伤害数值，也不会改挤压检测的盒子。
- 改挤压箱不会影响物理碰撞体积。
- 挤压参数是**全局一份**，对任意生物（含玩家被挤压）生效。

唯一自动关联：挤压箱若**未配置**该生物，会自动按「该生物碰撞箱外扩一圈」生成（半宽/高度各 `+0.1`，中心不变，见第 3.1 节），保证挤压伤害**永远按挤压箱结算**，不会退化成按碰撞箱结算。一旦你在 `public/squeeze/` 写了该生物的文件，就与碰撞箱完全解耦。

---

## 2. 碰撞箱配置（`public/hitboxes/`）

### 2.1 文件位置与命名

服务器通过 `/api/hitboxes` 读取 `public/hitboxes/` 目录下的所有 `.json`，文件名（去掉 `.json`）就是配置的 key。修改后游戏内执行 `/reload hitboxes`（或 `/reload all`、`/reload`）即可生效，无需重开页面。

分类 key（大/小 × 牛/猪/僵尸）：

| 文件名 | 覆盖范围 |
| --- | --- |
| `cow.json` | 所有成年牛 + 哞菇（cow_*、mooshroom_*） |
| `cow_baby.json` | 所有牛/哞菇幼体（cow_*_baby、mooshroom_*_baby） |
| `pig.json` | 所有成年猪（pig_cold / pig_temperate / pig_warm） |
| `pig_baby.json` | 所有猪幼体 |
| `zombie.json` | 僵尸 / 尸壳 / 溺尸（zombie、husk、drowned） |
| `zombie_baby.json` | 上述亡灵生物的幼体 |

也可以写 `<具体kind>.json`（例如 `pig_warm.json`）只覆盖单个 kind；**精确 kind 优先于分类**。未知家族的 kind 直接使用它自己的 key。

### 2.2 字段

**① 传统单矩形字段（向后兼容）**

```json
{
  "halfWidth": 0.75,
  "height": 1.2,
  "centerX": 0,
  "centerY": 0
}
```

- `halfWidth`：半宽（方块），必填。总宽度 = `halfWidth × 2`。
- `height`：高度（方块），必填。
- `centerX`：矩形中心相对生物锚点（脚底 x 中心）的水平偏移，默认 `0`。
- `centerY`：矩形中心相对生物锚点（脚底 y）的竖直偏移，默认 `height/2`（即箱底贴脚底）。

**② 多矩形并集（`boxes`）**

提供时优先于单矩形字段，允许一个生物由多个矩形拼成：

```json
{
  "boxes": [
    { "halfWidth": 0.2, "height": 1.6, "centerX": 0,  "centerY": 0.8 },
    { "halfWidth": 0.4, "height": 0.5, "centerX": 0,  "centerY": 1.85 }
  ]
}
```

物理碰撞/推开使用这些矩形的**并集包围盒**；点击、占用判定、F5 可视化逐矩形精确计算。

**③ 左右朝向（`left` / `right`）**

- `right`：face 朝右（`facing > 0`）时使用的矩形列表。
- `left`：face 朝左（`facing < 0`）时使用的矩形列表（显式配置优先）。
- 若**只写 `boxes`（或单矩形字段）、没写 `left`**，则朝左时自动对基础矩形做**水平镜像**（`centerX` 取反），一般即可让碰撞箱跟着贴图朝向走。
- 若 `left`/`right` 都写了，则各朝向独立使用对应矩形，不再自动镜像。

```json
{
  "boxes": [
    { "halfWidth": 0.25, "height": 0.9, "centerX": 0.15, "centerY": 0.45 }
  ],
  "left": [
    { "halfWidth": 0.25, "height": 0.9, "centerX": -0.1, "centerY": 0.45 }
  ]
}
```

### 2.3 生效

游戏内输入 `/reload hitboxes`（或 `/reload all`）。已存在的生物会立即用新配置刷新（`MobManager.refreshHitboxes()`）。

---

## 3. 挤压箱配置（`public/squeeze/`）

### 3.1 文件位置与命名

服务器通过 `/api/squeeze` 读取 `public/squeeze/` 目录下的 `.json`，**文件结构与碰撞箱完全一致**（`halfWidth`/`height`/`centerX`/`centerY` + `boxes` + `left`/`right`）。命名规则与碰撞箱一致（分类 key + 可选 `<kind>.json`）。

- 分类文件（`cow.json`、`zombie_baby.json` 等）覆盖该分类所有生物的挤压箱。
- `<kind>.json` 只覆盖单个 kind（精确 kind 优先于分类）。
- 某生物**没有**挤压箱文件时，自动按「碰撞箱外扩一圈」生成（半宽/高度各 `+0.1`，中心不变），不会直接使用碰撞箱几何。

> **默认约定**：内置的 `public/squeeze/*.json` 都是「对应碰撞箱半宽/高度各 `+0.1`、中心不变」的受压区（比碰撞箱略大一圈）。**挤压伤害只认挤压箱**：重叠检测、阈值参考尺寸、伤害公式全部使用挤压箱，玩家侧的挤压箱同样是「玩家身体外扩一圈」（半宽 `0.35`、高 `2.0`）。所以想让伤害严格跟随某个盒子，改 `public/squeeze/` 即可；改完记得 `/reload squeeze`（游戏运行时直接改文件不刷新，旧几何会一直生效到重载）。

### 3.2 字段

与碰撞箱完全相同，见第 2.2 节。例如给僵尸幼体配一个「头 + 身体」两块拼成的挤压箱：

```json
// public/squeeze/zombie_baby.json
{
  "boxes": [
    { "halfWidth": 0.1, "height": 0.2, "centerX": 0, "centerY": 0.375 },
    { "halfWidth": 0.02, "height": 0.3, "centerX": 0, "centerY": -0.1 }
  ]
}
```

挤压箱的**并集包围盒尺寸**就是「重叠多深才算挤压」的参考尺寸（等效于旧版的 `bodyWidth`/`bodyHeight`，但现在直接用盒子结构表达，并支持多矩形/左右朝向）。

### 3.3 生效

游戏内输入 `/reload squeeze`（或 `/reload all`）。已存在的生物会立即刷新挤压箱。

---

## 4. 挤压参数配置（`run/config/squeeze.json`）

### 4.1 位置与生效

服务器通过 `/api/squeeze-config` 读取 `run/config/squeeze.json`。首次启动服务器时会自动写入默认值（见下）。**这是一份全局配置，对任意生物（含玩家被挤压）生效**，不再按分类/kind 区分。

修改后执行 `/reload squeeze`（或 `/reload all`、`/reload`）生效，无需重启服务器。

### 4.2 字段（全部可省略，省略则用默认值）

```json
{
  "baseDamage": 2,
  "thresholdRatio": 0.4,
  "iframe": 1,
  "maxDamage": 10,
  "difficulty": 1,
  "playerDamageScale": 0.5
}
```

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `baseDamage` | 2 | 基础伤害，按重叠比例放大 |
| `thresholdRatio` | 0.4 | 重叠深度超过该生物挤压箱对应方向尺寸的这一比例才判定为挤压（0.4 = 40%） |
| `iframe` | 1 | 挤压无敌帧（秒），期间不再受挤压伤害（击退仍生效） |
| `maxDamage` | 10 | 单次结算上限：多实体挤压线性叠加但不超此值 |
| `difficulty` | 1 | 难度系数 |
| `playerDamageScale` | 0.5 | 玩家挤压怪物时的伤害缩放（主要效果是推开） |

> 伤害公式：`伤害 = baseDamage × min(1, 重叠深度/挤压箱尺寸) × difficulty × 缩放`，取水平/竖直两轴中更大者结算；**只有两个物体的挤压箱真实重叠**（任意矩形对相交）才会触发，仅靠在一起、有相对运动趋势但不重叠时不触发。

### 4.3 示例

加大挤压伤害、缩短无敌帧：

```json
// run/config/squeeze.json
{
  "baseDamage": 4,
  "thresholdRatio": 0.3,
  "iframe": 0.5,
  "maxDamage": 18,
  "difficulty": 1,
  "playerDamageScale": 0.5
}
```

想完全禁用挤压伤害，把 `baseDamage` 设为 `0` 即可。

---

## 5. 关于 `dist/` 与 `run/config`

- **碰撞箱/挤压箱源文件**（服务器通过 `/api/hitboxes`、`/api/squeeze` 读取）：`public/hitboxes/`、`public/squeeze/`。
- **挤压参数**（服务器通过 `/api/squeeze-config` 读取）：`run/config/squeeze.json`，不在 `public/` 下，不会被打包进 `dist/`。
- 执行 `npm run build` 后，`public/` 下的文件会被**复制**到 `dist/`，因此 `dist/hitboxes/*.json`、`dist/squeeze/*.json` 与源文件内容一致。若你看到/部署的是 `dist/` 目录，请**以 `public/` 为修改源**，改完重新构建；直接改 `dist/` 会在下次构建时被覆盖。
- 无需重启服务器：改完源/参数文件后，游戏内 `/reload hitboxes` 或 `/reload squeeze` 立即生效。