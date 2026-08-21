# 生物碰撞箱与挤压伤害配置指南（中文版）

> 适用项目：`D:\Project\My2DWorld-Web`
> 本文说明如何通过 JSON 文件给生物**碰撞箱**（几何/碰撞体积）与**物理挤压伤害**（挤压扣血）**分开配置**。

---

## 1. 核心概念：碰撞箱与挤压伤害是两套独立配置

| 配置 | 决定什么 | 文件位置（源） | 构建后位置 |
| --- | --- | --- | --- |
| 碰撞箱 | 生物的体积、能否与方块/其他实体重叠、被推开的方向、点击/占用判定、F5 可视化 | `public/hitboxes/*.json` | `dist/hitboxes/*.json` |
| 挤压伤害 | 实体真实重叠后扣多少血、多深才触发、无敌帧、单次上限、难度、玩家挤压缩放 | `public/squeeze/*.json` | `dist/squeeze/*.json` |

两者**互不干扰**：改碰撞箱大小不会改挤压伤害数值；改挤压伤害不会影响碰撞体积。唯一自动关联是：挤压配置里若**省略** `bodyWidth`/`bodyHeight`，会回退到该生物当前碰撞箱尺寸（用于计算「重叠多深才算挤压」的阈值），这是为了默认行为自然匹配，但只要你显式写了 `bodyWidth`/`bodyHeight`，就完全与碰撞箱解耦。

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

物理碰撞/推开使用这些矩形的**并集包围盒**；点击、占用判定、F5 可视化与挤压的真实重叠判定逐矩形精确计算。

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

## 3. 挤压伤害配置（`public/squeeze/`）

### 3.1 文件位置与命名

服务器通过 `/api/squeeze` 读取 `public/squeeze/` 目录下的 `.json`。命名规则与碰撞箱一致（分类 key + `default`）。修改后执行 `/reload squeeze`（或 `/reload all`、`/reload`）生效。

- `default.json`：全局默认，也作为**玩家被挤压**时的参数。
- 分类文件（`cow.json`、`zombie_baby.json` 等）：只覆盖该分类生物的挤压参数。
- 具体 `<kind>.json`：只覆盖单个 kind。
- 合并优先级：`default` → 分类 → 具体 kind。

### 3.2 字段（全部可省略，省略则用默认值）

```json
{
  "baseDamage": 2,
  "thresholdRatio": 0.4,
  "iframe": 1,
  "maxDamage": 10,
  "difficulty": 1,
  "playerDamageScale": 0.5,
  "bodyWidth": 0.8,
  "bodyHeight": 1.85
}
```

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `baseDamage` | 2 | 基础伤害，按重叠比例放大 |
| `thresholdRatio` | 0.4 | 重叠深度超过该生物对应方向尺寸的这一比例才判定为挤压（0.4 = 40%） |
| `iframe` | 1 | 挤压无敌帧（秒），期间不再受挤压伤害（击退仍生效） |
| `maxDamage` | 10 | 单次结算上限：多实体挤压线性叠加但不超此值 |
| `difficulty` | 1 | 难度系数 |
| `playerDamageScale` | 0.5 | 玩家挤压怪物时的伤害缩放（主要效果是推开）；读取自 `default` 配置 |
| `bodyWidth` | （碰撞箱宽） | 阈值参考的「身体宽度」，缺省用碰撞箱 `halfWidth×2` |
| `bodyHeight` | （碰撞箱高） | 阈值参考的「身体高度」，缺省用碰撞箱高度 |

> 伤害公式：`伤害 = baseDamage × min(1, 重叠深度/身体尺寸) × difficulty × 缩放`，取水平/竖直两轴中更大者结算；**只有两个物体碰撞箱真实重叠**（任意矩形对相交）才会触发，仅靠在一起、有相对运动趋势但不重叠时不触发。

### 3.3 示例

加大僵尸挤压伤害、缩短无敌帧、并把「身体参考尺寸」固定下来（彻底与碰撞箱大小解耦）：

```json
// public/squeeze/zombie.json
{
  "baseDamage": 4,
  "thresholdRatio": 0.3,
  "iframe": 0.5,
  "maxDamage": 18,
  "bodyWidth": 0.8,
  "bodyHeight": 1.85
}
```

想完全禁用某种生物的挤压伤害，把 `baseDamage` 设为 `0` 即可。

---

## 4. 关于 `dist/hitboxes` 与 `dist/squeeze`

- **源文件**（服务器实际通过 `/api/hitboxes`、`/api/squeeze` 读取）：`public/hitboxes/`、`public/squeeze/`。
- 执行 `npm run build` 后，`public/` 下的文件会被**复制**到 `dist/`，因此 `dist/hitboxes/*.json`、`dist/squeeze/*.json` 与源文件内容一致。若你看到/部署的是 `dist/` 目录，请**以 `public/` 为修改源**，改完重新构建；直接改 `dist/` 会在下次构建时被覆盖。
- 无需重启服务器：改完源文件后，游戏内 `/reload hitboxes` 或 `/reload squeeze` 立即生效。