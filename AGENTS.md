# AGENTS.md — 给后续 AI 代理的项目开发指南

本文件告诉接手这个仓库的 AI：项目怎么跑、怎么验证、以及**必须遵守**的关键约定，避免在改动时悄悄破坏既有行为。动手前先读完本文件与 `README.md`。

## 1. 运行与验证

```bash
npm install
npm run dev            # 启动 server.mjs（本地 /api/*）+ Vite，浏览器打开 http://127.0.0.1:5173
```

改完代码后**必须**通过的类型 / 语法检查：

```bash
npx tsc --noEmit       # 类型检查：tsconfig 开启 strict / noUnusedLocals / noUnusedParameters，不能有未使用变量/导入
node --check server.mjs
npm run build          # tsc --noEmit && vite build（生产构建验证）
```

**注意**：本仓库很多文件在 git 里处于已暂存（staged）状态，`git diff` 可能为空；查看改动请用 `git diff --cached`、`git status --short` 或直接读文件。不要因为 `git diff` 为空就以为改动丢了。

## 2. 架构速览

- `server.mjs`：本地 Node 服务，提供文件型 `/api/*`（账号/设置/世界存档/日志/资源清单），其余请求交给 Vite。
- `src/main.ts`：浏览器专属逻辑——界面状态、输入、Canvas 主循环与渲染、HUD、聊天、缩放、旁观/幽灵、游戏会话 `GameSession`。
- `src/core/`：可复用的游戏规则（不依赖 DOM）。
  - `world.ts`：`World`/`Chunk`/`Biome`、地形生成、区块流送、`breakBlock`/`placeBlock`/`setBlock`、NBT 覆盖、存档 serialize/restore、`isSolid`/`layerAt`/`hasSupport`。
  - `block.ts`：`BlockDefinition` / 运行时 `Block` / `BlockNbt`。
  - `registry.ts`：`Blocks`、`GameModes`、`blockRegistry`，以及 `BLOCK_FLAGS`（solid/transparent/nbt/feature）。
  - `entity.ts`：`MobManager`/`Mob`/`MOB_KINDS`，AI（索敌/追击/攻击）、召唤、碰撞/挤压。
  - `player.ts`：`Player`（位置/物理/二段跳/飞行/`ghost`/`waterJump`）。
  - `features.ts` / `structures.ts`：地表特征（草/花/树/仙人掌/岩石）与建筑生成。
  - `hitboxes.ts` / `squeeze.ts`：碰撞箱 / 挤压箱配置加载与插件覆盖。
  - `inventory.ts`：背包纯规则（左键拖动「均分」`distributeStack`），不依赖 DOM、可单独验证。
  - `items.ts`：物品（工具）注册表与纯规则（`stackLimit` 堆叠上限、`miningSpeedFor`/`miningSeconds` 挖掘速度与耗时、`attackDamageFor` 攻击伤害、`maxDurabilityFor`/`normalizeDurability` 耐久、`loadItemConfigs()` 加载 `public/items/items.json`），不依赖 DOM、可单独验证。
  - `tick.ts`：客户端 tick 速率（游戏速度）的纯计算（`NORMAL_TICK_RATE = 20`、`clampTickRate`、`tickScale`、`simulationSteps` 帧内子步拆分），不依赖 DOM、可单独验证。
  - `daylight.ts`：昼夜与环境光照的纯计算（时刻 → 天空亮度/颜色、日月星空、格子光照、压暗带几何 `ambientBands`/`ambientRampHeight` 含设备像素对齐），不依赖 DOM、可单独验证。
  - `pixels.ts`：设备像素对齐的纯计算（`snapToDevice`、`deviceSpanSize`、`needsDeviceSnap`），消除非整数 `devicePixelRatio` 下相邻色块之间的抗锯齿接缝（海洋白线），不依赖 DOM、可单独验证。
  - `holdstyle.ts`：手持工具时 `itemL`/`itemR` 节点的几何覆盖配置（`public/items/hold.json` 经 `/api/hold` 加载，`parseHoldStyle` 容错解析、`holdGeometryFor` 纯判定），不依赖 DOM、可单独验证；渲染在 `skeleton.ts` 的 `holdVariant()` 里生成共享贴图的轻量副本。
  - `storage.ts`：同步本地 API 客户端；`types.ts`：稳定数据结构。
- `src/modes/`：`creative.ts`（创造）、`survival.ts`（生存，含挖掘速度/工具耐久，`canMine` 开关）、`adventure.ts`（冒险，继承生存、`canMine = false`）、`spectator.ts`（旁观）四个 `GameMode` 实现。
- `src/plugins/api.ts`：插件扩展注册表与生命周期 API。
- `public/hitboxes/`、`public/squeeze/`：实体碰撞箱 / 挤压箱 JSON（走 `/api/hitboxes`、`/api/squeeze`）。
- `public/items/items.json`：物品（工具）定义（挖掘速度/伤害/耐久/堆叠上限，走 `/api/items`），贴图在 `public/assets/items/`。
- `public/items/hold.json`：手持**工具**时 `itemL`/`itemR` 的显示几何（`w`/`h`/`pivot`，走 `/api/hold`）；见 §3.11。
- `public/blocks/blocks.json`：方块定义（`hardness` 硬度、`tool` 对口工具类别，走 `/api/blocks`）。

## 3. 关键不变量（改动前务必理解，不要破坏）

### 3.1 三层 NBT 系统
- 每个方块可带 `BlockNbt`，其中 `layer?: 1 | 2 | 3`。
- 只有第 1 层挡路（`World.isSolid` 对 `layerAt !== 1` 一律返回 false）；第 2 层=树叶、第 3 层=木头（世界生成默认）。
- 玩家只能把方块放在第 1 层：`placeBlock` 强制写入 `{layer: 1}`。
- 覆盖 NBT 存在 `World.blockNbt`（key `"x,y"`），序列化到 `WorldSave.nbt`，由 `server.mjs` 持久化；与方块定义默认值一致的 NBT 不落盘。

### 3.2 地物（花/草/仙人掌，`feature: true`）
- 放置必须有实心支撑：`placeBlock` / `getPlacementTarget` 用 `world.hasSupport(x, y)`（= 正下方 `isSolid`）拒绝悬空。
- **破坏级联**：`World.breakBlock(x, y, onBroken?)` 删除目标格子后，若其**正上方**是地物（`feature: true`，如短草/花/仙人掌），会递归一并破坏——支撑消失、地物掉落。只级联 feature 方块，树干/树叶/普通方块不随之掉落。改动时保留这个级联，不要退回「只破坏单格」。
- **级联上报**：`onBroken(x, y, block)` 对每一格真正被破坏的方块回调一次（先目标格，再逐层向上的地物）。modes 把它接到 `ModeContext.onBlockBroken`，`main.ts` 据此为**每一格**生成掉落物/通知插件——所以挖掉花草底下的泥土时花草也会掉落自身，而不是凭空消失。新增破坏入口（命令、爆炸等）时要么走 `breakBlock` 带上该回调，要么自己处理级联掉落。

### 3.3 命中箱 / 挤压箱的采样存储单位
- `public/hitboxes/*.json` 与 `public/squeeze/*.json` 里的长度（`halfWidth`/`height`/`centerX`/`centerY`/`boxes`/`left`/`right`）是 **32×整数**（即「块单位 × 32 后四舍五入」）。
- 加载时 `scaleHitboxConfig(config, 1/ HITBOX_FILE_UNIT)`（`HITBOX_FILE_UNIT = 32`）还原为块单位，游戏内数值不变。
- 改这些 JSON 必须保持 32×整数；插件 `api.registerHitbox()` 仍用块单位。相关常量见 `src/core/hitboxes.ts`。

### 3.4 旁观 / 幽灵（`player.ghost`）
- 每帧 `this.player.ghost = this.spectate || this.modeName === "spectator"`（`F7` 灵魂出窍、`F4` 旁观模式）。
- 幽灵语义：**不吸引仇恨**（`entity.ts` 的 `Mob.update` 里 `player.ghost && config.hostile -> idle`）、**不受任何伤害**（`damagePlayer`、方块挤压 `updateSqueeze`、虚空 `updateVoid`、实体挤压回调都要检查 ghost）、**不与生物物理碰撞**（`collideWithPlayer = !ghost`）。
- **幽灵无碰撞/挤压箱**：`player.ghost` 时 `moveBody` 走 `noclip`（跳过世界碰撞，直接积分位置）；`squeezeEntities` 跳过整段「玩家×生物」挤压结算；生物生成不再以玩家箱为准避让；F5 不绘制玩家碰撞/挤压箱。改动时保留这些 ghost 判断，否则旁观/灵魂出窍会被撞墙或误伤。
- 灵魂出窍时**身体跟随视角**：`mousemove` 拖动直接改 `player.x/y`（不再用 `cameraOffset` + `clampSpectateOffset` 出窍偏移；单次拖拽最多移动 `SPECTATE_LIMIT` 格）。

### 3.5 渲染性能
- 缩放到 **25%（`blockSize <= 8`）** 时，可见方块数激增。渲染循环会**按列合并连续相同方块**为一次 `drawImage`（最近邻竖向拉伸），避免逐格绘制卡顿。改动方块渲染时保留这个 `mergeColumns` 分支；`>= 16`（>25%）仍逐格绘制以保纹理平铺精度。
- `blockImageFor` 里的草/树叶/草丛通过 `biomeAtCached(x)` 按整数列缓存 `biomeAt`，不要改回每帧每块重复算噪声。
- F3 的 FPS 是**真实帧率**（`this.fps` EMA），不是写死的 60。
- **设备像素对齐**（`src/core/pixels.ts`）：画布后备存储按 `devicePixelRatio` 放大，绘制用 `ctx.setTransform(dpr, …)`。`dpr` 不是整数时（Windows 125%/150% → 1.25/1.5），整数 CSS 坐标落在半个物理像素上，相邻两个半透明 `fillRect` 各自按覆盖率抗锯齿 → 交界像素的合成 alpha 低于设定值 → 背景透出来（水面上一格一条的**水平白线**，摄像机移动时相位扫动所以「移动才出现」）。因此方块、流体（`drawFluid`）、环境光压暗带（`daylight.ts` 的 `ambientBands`/`ambientRampHeight` 接受 `dpr`）的每条边都用 `snapToDevice` 对齐、长度用 `deviceSpanSize`：
  - 相邻两格必须用**同一个表达式**算共享边（右邻的左边 = 本格的右边），否则会对不齐；
  - 不要为了「消缝」把矩形放大 1px 去重叠——半透明色块重叠会变深，也一样是线；
  - `dpr` 为整数时这些函数是恒等变换（与旧版逐像素一致），别在这里引入 `dpr` 相关的分支逻辑；
  - 新增任何大面积/半透明的世界层绘制（新的液体、滤镜、渐变带）时同样要走这两个函数。

### 3.6 水面不能起跳（`player.waterJump`）
- `Player.waterJump` 由 `main.ts` 的 `applyModeFlags()` 设置：**生存/冒险模式为 false**（创造/旁观为 true，行为与旧版一致）。
- `waterJump === false` 时，脚底在「所在列脚下水柱的液面」或更低 → 按空格只走上浮/浮力分支，**拿不到起跳速度**；脚底高于液面（浮出水面后）才允许正常起跳。判据是 `player.ts` 的 `waterSurfaceUnder()`（脚下向下 3 格内找水，返回该水柱最高一格的顶面 y），不要换成「脚下一格是水就不许跳」——玩家上浮只能到液面以上约 0.4 格，那样会把人永久困在水里（实测跳不出、也爬不上岸）。
- 水面跳跃曾经是**无限上升漏洞**：在水面反复点空格可以一路升到几百格高（`jumpsUsed` 被水重置 + 水面可跳）。改动后同样场景上限约 7 格（实测 278 → 67），真实河边/海边仍能在 6~8 秒内爬上岸。改这段时务必同时验证「不能在水面跳」和「还能上岸」两件事。

### 3.7 昼夜与环境光照
- 时间只有一份：`GameSession.time`（秒，0..`DAY_LENGTH_SECONDS`=1200s）。只在世界真正推进时前进（`tick` 里同一段 `!paused && !chatOpen && !inventoryOpen` 内、且 `settings.dayNightCycle` 为真），写入 `WorldSave.time`。
- 天空亮度/颜色、日月位置、格子光照、压暗带的几何**全部**在 `src/core/daylight.ts` 里算，`main.ts` 只负责画。不要在 `main.ts` 里再写一套亮度公式（正午天空色 `rgb(130,201,215)` 就是原来的 `#82c9d7`，别改）。
- 明暗分界是 `World.columnTop(x)`（该列最高**非空气**方块，含水与花草），按列缓存、改方块/卸载区块时失效。洞穴、深水、树荫靠它变暗；**不要**换成「最高实心方块」，那样水面与花丛会被漏掉。
- 压暗只覆盖分界**以下**：分界以上是天空，由天空调色板自己变暗，再叠一层会变成双重压暗。
- 实体（生物/玩家/掉落物）在压暗层之后绘制，必须自己按 `lightAt(x, y)` 压暗，否则夜里会是一堆亮块。`settings.ambientLight = 0` 表示关闭光照（全亮），改渲染时保留这个分支。
- 若要改暗度：只动 `daylight.ts` 的 `MIN_SKY_LIGHT` / `MIN_CAVE_LIGHT` / `SHADOW_DEPTH`，并跑一遍「水面亮、河床暗、洞穴 = MIN_CAVE_LIGHT」的验证。

### 3.8 工具 / 物品（`src/core/items.ts` + `public/items/items.json`）
- 物品定义只来自 `public/items/items.json`（经 `/api/items`，`loadItemConfigs()` 在 `startGame()` 里、`GameSession` 构造**之前**加载；游戏内 `/reload items` 重新读取）。贴图在 `public/assets/items/`，`texture` 字段=文件名。
- 加载器对每条 id 单独 try/catch：一条非法 id（例如配置里写了注释键 `"//"`）只跳过自己，不能让整份配置加载失败——`Registry.get/upsert` 对语法非法的 id 会抛错。
- **挖掘速度只有一个入口**：`miningSpeedFor(手持id, 方块tool)` + `miningSeconds(硬度, 速度)`（`survival.ts` 里 `mineProgress += dt / miningSeconds(...)`）。只有工具类别与方块 `tool` 一致才加速，否则=空手速度 1。不要在模式里另写一套硬度/时间换算。
- 方块的 `tool` 字段在 `public/blocks/blocks.json`：石头/矿石/深板岩=镐、原木=斧、草方块/泥土/沙子/雪=锹、树叶=锄；草丛/花没有 `tool`（任何工具都不加速）。
- **堆叠上限按物品区分**（`stackLimit(id)`：工具 1、其余 64）。`main.ts` 与 `itemdrop.ts` 里**不要**再用全局 `MAX_STACK_SIZE` 做单格上限；合并、均分、`/give`、中键复制、掉落物合并都要走 `stackLimit`，并且只在耐久一致时才合并。
- **耐久**：`ItemStack.durability` = 剩余耐久（缺省=满）。生存/冒险模式挖掉一格/命中一次生物扣 1 点（`context.onToolUsed` → `damageTool`），创造模式**不**调用（不消耗）；归零损坏并清空该格。存档（`normalizeStack`）与掉落物（`DroppedItemManager.spawn/serialize/restore`）都必须带上耐久，否则丢出去捡回来会变成满耐久。工具不可堆叠，所以掉落物不合并。
- 手持工具/物品**不能放置**：`getPlacementTarget()` 与 `place()` 都用 `isPlaceableBlock()` 拦住，避免把工具 id 写进世界当方块。

### 3.9 游戏速度（`/tick`，`src/core/tick.ts`）
- `GameSession.tickRate`（默认 20 = 正常速度）、`frozen`、`pendingSteps` 只在会话内，不写存档；`/tick` 命令是唯一入口。
- 世界模拟已抽成 `stepWorld(dt)`：`tick()` 里正常路径用 `simulationSteps(dt, tickRate, MAX_STEPS_PER_FRAME)` 拆子步，冻结路径只补跑 `/tick step` 排队的 tick。**新增任何世界状态推进都要放进 `stepWorld`**，否则它不会随 `/tick` 变速/冻结（渲染与界面计时留在 `tick()` 里）。
- 每个子步 ≤ `MAX_STEP_SECONDS`（1/20 秒）：20 tick 且 60fps 时就是「一帧一步、步长 = 帧时长」，与改动前的行为完全一致；倍速只改变每帧的步数，不改变单步物理（`Player.update`/`Mob.update` 内部都还有 `Math.min(dt, 0.05)` 上限）。改这里要保持这个性质，否则 10 倍速会穿墙。
- 冻结时昼夜时刻、流体、生物、掉落物、自动保存一并停住（都在 `stepWorld` 里）。

### 3.10 游戏模式（创造 / 生存 / 冒险 / 旁观）
- 模式名 union 在 `src/core/types.ts` 的 `GameModeName`；注册在 `src/core/registry.ts` 的 `gameModeRegistry`；实现由 `src/modes/index.ts` 的 `createMode()` 分发；模式图标表是 `main.ts` 的 `MODE_ICON_SOURCES`（同时决定 `/gamemode` 的可选值 `GAME_MODE_NAMES`）。**加新模式要同时改这五处**（外加 `i18n.ts` 的 `mode_<id>` / `world_mode_<id>`、`server.mjs` 存档白名单，否则存盘会把模式改写回 `creative`）。
- **冒险模式 = 不能破坏方块的生存模式**：`src/modes/adventure.ts` 继承 `SurvivalMode`，只把 `protected canMine` 覆写为 `false`；`SurvivalMode.update` 在「没有点中生物」之后、进入挖掘逻辑之前 `if (!this.canMine) { this.mineProgress = 0; return; }`，所以挖方块没有裂纹、不产生掉落、不扣耐久，而攻击生物照旧。不要给冒险模式单独复制一份生存逻辑。
- 模式差异统一走 `main.ts` 的 `survivalLike` getter（生存或冒险）：放置消耗方块、`onToolUsed`（工具耐久）、`onBlockBroken` 掉落自身、`destroyHoveredItem` 丢到世界、`applyModeFlags` 的禁飞与 `waterJump`。**不要**再到处写 `this.modeName === "survival"`。
- 免伤判定仍以 `creative` / `spectator` / `ghost` 为准（`damagePlayer`、实体挤压回调、`updateSqueeze`、`updateVoid`）——冒险模式**会**受伤，别把它加进免伤分支。
- 模式图标（`public/assets/gui/gamemode/{creative,survival,adventure,spectator}.png`，64×64 白色剪影）在构造时与 `/reload images` 时由 `loadModeIcons()` 加载；HUD 右上角与切换提示都用 `modeIconKey()`/`modeIcon()` 取当前模式的图标，不要按模式写 if 分支。

### 3.11 手持工具几何 / 生物攻击前摇 / 掉落物浮力
- **手持工具几何**（`public/items/hold.json` + `src/core/holdstyle.ts` + `src/core/skeleton.ts`）：玩家动画里 `itemL`（副手）/`itemR`（主手）在模板中的值固定是 `w/h=0.4`、`pivot=[0.5,0.5]`；**拿带 `tool` 字段的物品**时按配置换成 `w/h=2`、`pivot=[0,1]`（左下角=握把）。规则：
  - 只改**这只手**：副手拿工具、主手拿方块时互不影响（`holdGeometryFor(id, mask)`，mask bit0=itemL、bit1=itemR）；拿方块/空手时**绝不**改。
  - 通过 `Animation` 的「共享贴图的轻量副本」实现（`holdVariant()`），**不要就地改 `.myanim` 的 `AnimDef` 对象**——模板会被别的 kind/掩码共用；也不要改 `public/animations/player/*.myanim` 里的原值（那会影响非工具物品）。
  - 配置版本变化（`setHoldStyle`）或 `/reload images` 时会丢弃变体缓存（`clearHoldVariants`），所以贴图/数值改完无需重开页面；`/reload items` 会同时重读 `hold.json`。
- **生物攻击前摇**（`src/core/entity.ts`）：敌对生物进入攻击距离后先僵直 `MOB_ATTACK_WINDUP = 0.1s`（`Mob.windupTimer`），期间 `velocityX = 0`、不结算伤害，倒计时结束才 `onPlayerDamage`；僵直期间玩家跑出攻击距离 → 状态离开 `attack` → 前摇清零（这一下打空）。**冷却在抬手瞬间开始计时**（不是命中时），所以攻击间隔仍约等于 `attackCooldown`。新增攻击行为时不要绕过 `windupTimer`。
- **掉落物浮力**（`src/core/itemdrop.ts` + `fluid.ts` 的 `fluidSurfaceAt`）：水里有净浮力（52 > 重力 24），上浮速度上限 2.2 方块/秒，底部停在液面下 0.15 格并清零竖直速度（不抖）；**岩浆不适用浮力**（仍是重力减弱 + 缓慢下沉）。液面用「该列向上连续流体格的最高顶面」算，别改成「液面 = 丢出点」或写死海平面 `SEA_LEVEL`，否则水池/被堵住的液面会算错。

## 4. 常见任务指引

- 新增方块：纹理放 `public/assets/block/`，`src/registry.ts`（本体）或插件 `registerBlock`（插件），显示名在 `src/i18n.ts`。详见 `README.md`「扩展开发」。
- 新增游戏模式：`src/modes/` 新建 `GameMode`（只差一两条规则就继承已有模式并覆写开关，见 §3.10），改 `createMode()`、`GameModeName`、`gameModeRegistry`，加 i18n 名称，图标放进 `public/assets/gui/gamemode/` 并加入 `MODE_ICON_SOURCES`，最后补上 `server.mjs` 的存档白名单。
- 改渲染/加半透明色块：方块、流体、压暗带的屏幕矩形一律用 `src/core/pixels.ts` 的 `snapToDevice` / `deviceSpanSize` 对齐设备像素（见 §3.5），否则非整数 `devicePixelRatio` 下会重新出现水面白线。
- 新增物品/工具：贴图放 `public/assets/items/`，配置加进 `public/items/items.json`（`label`/`texture`/`tool`/`tier`/`miningSpeed`/`damage`/`durability`/`stackSize`）；要让某方块被这类工具加速，给 `public/blocks/blocks.json` 里那个方块加 `tool`。游戏内 `/reload items` 生效，`/give <id>` 拿取。详见 `README.md`「工具与物品配置」。
- 改手持物品的显示大小/旋转中心：只改 `public/items/hold.json`（`w`/`h`/`pivot`），`/reload items` 生效；不要改 `.myanim` 里的 `itemL`/`itemR` 原值（见 §3.11）。
- 玩家姿态（攻击/挖掘/走/站）：只在 `src/modes/base.ts` 的 `playerPose()` 里定优先级，攻击必须优先于挖掘；点中生物用 `attack.myanim`，挖方块用 `dig.myanim`，两条动画时钟分开（`attackAnimTime` / `mineAnimTime`）。
- 调生物攻击节奏：前摇改 `MOB_ATTACK_WINDUP` 或单个 kind 的 `MobKindConfig.attackWindup`；掉落物浮力参数在 `src/core/itemdrop.ts` 顶部（`DROP_BUOYANCY` / `DROP_FLOAT_RISE` / `DROP_FLOAT_SUBMERGE`）。
- 调游戏速度/加世界更新：只动 `core/tick.ts` 与 `stepWorld`（见 §3.9），并跑一遍「20 tick 且 60fps 时一帧一步、步长=帧时长」的验证。
- 调碰撞箱/挤压箱：改 `public/hitboxes/`、`public/squeeze/`（32×整数），游戏内 `/reload hitboxes`、`/reload squeeze` 生效。挤压伤害「只按挤压箱结算」不要退回按碰撞箱结算。
- 改存档格式：遵循「只存脏区块」模型（`World.serializeChanges` 只序列化 `dirty`，`restore` 用 `idTable` 重映射数字 ID）。

## 5. 语言与风格

- 与用户用中文沟通；代码注释多为中文，保持一致；文件/变量名用英文。
- 保持 TypeScript strict；不要留未使用的导入/变量（否则 `tsc --noEmit` 失败）。
- 每个改动后跑一遍第 1 节的验证命令，再交付。

## 6. 额外补充
- 回答问题之前若任务要求修改文件,则不能只回答问题而不修改文件
- 增加新的指令时，要将新增的指令用法写入`/docs/zh_cn/commands_zh.md`中
