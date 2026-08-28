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
  - `player.ts`：`Player`（位置/物理/二段跳/飞行/`ghost`）。
  - `features.ts` / `structures.ts`：地表特征（草/花/树/仙人掌/岩石）与建筑生成。
  - `hitboxes.ts` / `squeeze.ts`：碰撞箱 / 挤压箱配置加载与插件覆盖。
  - `storage.ts`：同步本地 API 客户端；`types.ts`：稳定数据结构。
- `src/modes/`：`creative.ts`（创造）、`spectator.ts`（旁观）两个 `GameMode` 实现。
- `src/plugins/api.ts`：插件扩展注册表与生命周期 API。
- `public/hitboxes/`、`public/squeeze/`：实体碰撞箱 / 挤压箱 JSON（走 `/api/hitboxes`、`/api/squeeze`）。

## 3. 关键不变量（改动前务必理解，不要破坏）

### 3.1 三层 NBT 系统
- 每个方块可带 `BlockNbt`，其中 `layer?: 1 | 2 | 3`。
- 只有第 1 层挡路（`World.isSolid` 对 `layerAt !== 1` 一律返回 false）；第 2 层=树叶、第 3 层=木头（世界生成默认）。
- 玩家只能把方块放在第 1 层：`placeBlock` 强制写入 `{layer: 1}`。
- 覆盖 NBT 存在 `World.blockNbt`（key `"x,y"`），序列化到 `WorldSave.nbt`，由 `server.mjs` 持久化；与方块定义默认值一致的 NBT 不落盘。

### 3.2 地物（花/草/仙人掌，`feature: true`）
- 放置必须有实心支撑：`placeBlock` / `getPlacementTarget` 用 `world.hasSupport(x, y)`（= 正下方 `isSolid`）拒绝悬空。
- **破坏级联**：`World.breakBlock` 删除目标格子后，若其**正上方**是地物（`feature: true`，如短草/花/仙人掌），会递归一并破坏——支撑消失、地物掉落。只级联 feature 方块，树干/树叶/普通方块不随之掉落。改动时保留这个级联，不要退回「只破坏单格」。

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

## 4. 常见任务指引

- 新增方块：纹理放 `public/assets/block/`，`src/registry.ts`（本体）或插件 `registerBlock`（插件），显示名在 `src/i18n.ts`。详见 `README.md`「扩展开发」。
- 新增游戏模式：`src/modes/` 新建 `GameMode`，改 `createMode()`，加 i18n 名称。
- 调碰撞箱/挤压箱：改 `public/hitboxes/`、`public/squeeze/`（32×整数），游戏内 `/reload hitboxes`、`/reload squeeze` 生效。挤压伤害「只按挤压箱结算」不要退回按碰撞箱结算。
- 改存档格式：遵循「只存脏区块」模型（`World.serializeChanges` 只序列化 `dirty`，`restore` 用 `idTable` 重映射数字 ID）。

## 5. 语言与风格

- 与用户用中文沟通；代码注释多为中文，保持一致；文件/变量名用英文。
- 保持 TypeScript strict；不要留未使用的导入/变量（否则 `tsc --noEmit` 失败）。
- 每个改动后跑一遍第 1 节的验证命令，再交付。

## 6. 额外补充
- 回答问题之前若任务要求修改文件,则不能只回答问题而不修改文件
