# My2DWorld Web

这是 Python + pygame 版 2D 沙盒游戏的浏览器迁移版本。浏览器使用 Canvas 2D 渲染游戏，本地 Node 服务负责账号、设置、世界列表和世界存档文件。

## 运行项目

```bash
npm install
npm run dev
```

在浏览器打开 `http://127.0.0.1:5173`。

如需使用其他端口：

```bat
set PORT=5174
npm run dev
```

生产构建验证：

```bash
npm run build
```

开发时必须执行 `npm run dev`，不能直接执行 `vite`。`server.mjs` 会先提供基于文件的 `/api/*` 接口，再将其他请求交给 Vite 处理。

默认账号：`steve` / `1234asdf`。登录界面不再预填账号名，点击"使用默认账号"登录前会弹窗确认。

## 项目结构

```text
web/
├── server.mjs                 本地 HTTP 服务和 Vite 中间件宿主
├── src/
│   ├── main.ts                界面状态、输入、Canvas 主循环、HUD、聊天
│   ├── i18n.ts                集中的中英文显示文案
│   ├── registry.ts             Blocks/GameModes 统一注册表入口
│   ├── core/
│   │   ├── world.ts           World/Chunk 对象、地形、区块和方块状态
│   │   ├── block.ts           Block 运行时对象和 BlockDefinition
│   │   ├── player.ts          Player 对象、物理、碰撞、二段跳和飞行
│   │   ├── physics.ts         共享刚体移动与地面碰撞
│   │   ├── entity.ts          实体/Mob、AI、召唤与碰撞箱
│   │   ├── features.ts / structures.ts  地形特征（树、仙人掌、建筑等）
│   │   ├── particles.ts       从纹理采样的方块破坏粒子
│   │   ├── hitboxes.ts        服务端碰撞箱配置加载与插件覆盖
│   │   ├── skeleton.ts / anim.ts / animations.ts  字符动画与 .myanim 解析渲染
│   │   ├── storage.ts         同步本地 API 客户端
│   │   └── types.ts           稳定的游戏数据类型
│   ├── modes/                 旁观和创造模式实现
│   └── plugins/api.ts         插件扩展注册表与生命周期 API
├── public/
│   ├── assets/                从 Python 版迁移的纹理、字体和背景
│   ├── animations/            .myanim 字符动画文件（/api/animations 清单）
│   └── hitboxes/              按 mob kind 的碰撞箱 JSON 覆盖（/api/hitboxes）
├── plugins/                   自动扫描并加载的外部 ESM 插件
└── run/                       由 server.mjs 创建的本地运行数据
    ├── accounts/
    ├── config/
    ├── logs/
    └── worlds/
```

`main.ts` 负责浏览器专属逻辑；可复用的游戏规则放在 `core/`；新游戏模式放在 `modes/`。游戏对象统一从 `registry.ts` 的 `Blocks`、`GameModes` 和 `Registries` 获取；插件应通过 `plugins/api.ts` 扩展，不应直接依赖游戏内部状态。

核心运行时按对象职责组织：`Block` 表示世界中的一个方块实例，持有类型定义和坐标；`Chunk` 管理 16 格宽的区块与区块内方块；`World` 管理区块流送、世界修改和存档转换；`Player` 管理位置、状态和移动物理；`GameMode` 只编排模式规则。运行时使用对象，存档仍只保存方块 ID、坐标和基础数据，避免把类实例直接序列化。

## 世界高度

世界采用类似现代 Minecraft 的纵向空间：

| 数值 | 说明 |
| --- | --- |
| 建造高度上限 `Y=320` | 最高可放置方块的 Y 坐标为 `319` |
| 最低点 `Y=-64` | 底部两层为基岩（`-64`、`-63`），之下为虚空 |
| 深板岩 | `Y≈0` 以下过渡为深板岩及其矿石变种 |

各群系地表高度：平原 64–70、森林 64–70、沙漠 66–70、雪原 88–100、山地最高可达 130–190+（`Y≥148` 会覆盖积雪帽）。矿石按深度分层（煤矿石分布在高层，钻石/红石/金矿等深入地下），并在地表下形成对应深层矿石变种。

## 运行数据

Web 版本有意不使用 `localStorage`。所有可变数据都以 JSON 文件保存在 `web/run/` 下，目录结构与 Python 项目的运行数据布局一致。

```text
run/accounts/<用户名>.json          加盐 SHA-256 账号记录
run/config/<用户名>.json            用户界面、移动参数和按键绑定
run/worlds/<用户名>.json            世界列表和每个世界的物理参数
run/worlds/<用户名>_<世界ID>.json   玩家位置、模式、方块数字 ID 表
run/worlds/<用户名>_<世界ID>.chunk.<区块X>.<区块Y>.dat   被修改区块的原始字节
```

世界 ID 使用 UUID，因此修改显示名称不会影响存档路径。存档采用"只存被修改区块"的脏区块模型：未触碰区块在进入视距时由种子重建，玩家破坏/放置只标记所在区块，自动保存仅上传脏区块。世界状态 JSON 记录玩家位置、模式与 `idTable`（数字方块 ID → 资源 ID 的映射），每个脏区块存为独立的二进制 `.dat` 文件（原始 Uint16Array 小端字节，可还原为 base64 传输）：

```json
{
  "playerX": 0,
  "playerY": 45.001,
  "mode": "creative",
  "idTable": ["my2dworld:grass_block_side", "my2dworld:dirt"]
}
```

加载时先按种子重建区块，再用 `idTable` 把存档中的数字 ID 重映射到当前插件集的方块。旧版"重建 + 差异"存档格式不再识别，直接视为全新世界。

服务端只允许文件名组件使用单词字符、连字符和下划线，以阻止路径遍历。

## 日志系统

日志遵循原 Python 项目的运行方式：每次执行 `npm run dev` 都会在 `run/logs/` 创建一个按本机启动时间命名的文件，例如 `2026-08-04_14-30-00.log`。日志同时输出到 Node 控制台和文件。

服务端会记录启动、账号初始化、登录/注册、设置保存、世界列表保存、世界存档写入与删除、插件扫描及 API 错误。浏览器会通过本地 `/api/log` 接口记录游戏开始、结束、暂停、恢复、模式切换、方块放置/破坏、虚空重生和移动速度修改。

日志仅记录事件参数，不记录明文密码。登录和注册日志仅记录用户名和结果。

## 操作说明

默认按键可在游戏中通过 `Esc` -> `设置` -> `按键绑定` 修改。

| 操作 | 默认按键 |
| --- | --- |
| 向左 / 向右移动 | `A` / `D` |
| 向上 / 向下移动 | `W` / `S` |
| 跳跃 / 双击飞行 | `Space`（飞行时按住 `Space` 上升、`Shift` 下降） |
| 破坏方块 | 鼠标左键 |
| 放置方块 | 创造模式鼠标右键 |
| 移动旁观相机 | 鼠标右键拖动（旁观模式玩家跟随移动；创造模式 `F7` 灵魂出窍后仅移动视角） |
| 灵魂出窍（创造模式） | `F7` |
| 选择快捷栏 | `1` 到 `9`、点击，或在快捷栏上滚动滚轮 |
| 缩放 | 快捷栏外滚轮、`+`、`-` |
| 调试信息 | `F3` |
| 切换模式 | `F3` + `F4` |
| 聊天 | `T` 或 `/` |
| 全屏 | `F11` |
| 暂停 | `Esc` |
| 切换语言 | `Ctrl` + `L` |

世界存档默认每 5 分钟自动保存（可在 `Esc` -> `设置` 中改为关闭、1 分钟或 10 分钟），掉入虚空重生时也会立即保存。`设置` 中还提供鼠标指针模式：`十字准心` 始终显示准心，`默认` 则按操作状态切换贴图（普通 `mouse.png`、创造模式悬停方块 `mouse_left_broke.png`、放置位置/旁观拖动 `mouse_right_place_and_move.png`）。`设置` -> `显示样式` 可分别调整放置预览贴图与灵魂出窍玩家贴图的透明度（30%/50%/70%/100%）和亮度（50%/75%/100%）。创造模式右上角会显示飞行/行走状态图标，放置位置会半透明显示当前快捷栏方块的预览贴图。灵魂出窍时视角可在身体周围 32 格范围内自由移动（右键拖动），期间玩家本体冻结、无法控制移动。

创造模式会显示相邻格预览，可直接向空格放置方块，并拒绝任何会与玩家碰撞盒重叠的位置。放置和破坏范围限制在以玩家为中心的高 6 格、宽 5 格的矩形内，范围外的方块不会显示白色方框。

## 聊天命令

只有以 `/` 开头的输入会作为命令解析，普通输入会显示为聊天消息。

```text
/gamemode creative | spectator
/speed <数值>      # /movespeed <数值> 同义
/debug on | off
/seed              # 查看当前世界种子
/locate <群系>     # 定位最近的群系并传送
/tp <x> [y]        # 传送到指定坐标
/summon <实体> [x] [y]   # 召唤一只不会因距离消失的怪物
/structure export|load|list|delete   # 自定义结构导入/导出
/reload [images | animations | hitboxes | plugins | all]
```

`/reload` 就地刷新资源与配置，无需重新加载页面：`images` 重新请求方块/GUI/角色贴图（带缓存爆破），`animations` 重新拉取 `public/animations` 清单，`hitboxes` 重新加载 `public/hitboxes` 配置并刷新已有实体碰撞箱，`plugins` 卸载并重新安装全部插件。省略目标时等于 `all`。聊天输入框是真实 DOM 输入框，支持选中、复制/粘贴与中文输入法。

创建世界时可以填写种子（留空则自动生成）：同一种子总是生成相同地形，可用于复现或分享世界。世界列表和 F3 调试面板会显示当前世界的种子，`/seed` 命令可在游戏内查看。

聊天行为与 Python 版一致：`Tab` 循环补全命令或参数，`ArrowUp` 和 `ArrowDown` 浏览已提交输入历史，聊天框打开时可用滚轮（或 `PageUp`/`PageDown`）浏览消息记录。

`/speed` 会更新当前玩家、当前世界的 `physics.walkSpeed` 以及用户默认移动设置，并写入对应运行数据文件。因此重新进入世界后仍会保留命令设定的速度。

## 渲染说明

全部源美术资源已从 `py/image/` 和 `py/fonts/` 迁移。

- Canvas 图像平滑已关闭。
- 方块绘制位置和缩放尺寸会取整到像素。
- 方块严格按一个方块尺寸绘制，不重叠覆盖。
- 方块破坏粒子从被破坏方块的真实纹理中随机裁切，不使用生成颜色。
- 玩家碰撞盒保持为 `0.5 x 1.9` 世界方块；原始正方形角色贴图以更宽的视觉尺寸绘制，避免人物看起来被压扁。
- 怪物碰撞箱可配置：默认值在 `src/core/entity.ts` 的 `MOB_KINDS`，可用 `public/hitboxes/<kind>.json`（服务端 `/api/hitboxes` 暴露）按 kind 覆盖，插件运行时可用 `api.registerHitbox()` / `api.setHitboxes()` 覆盖（插件优先级最高）。省略 `centerY` 时默认 `height/2`（脚底锚定），物理碰撞、点击/范围判定与可视化共用同一碰撞箱。`F3` 旁的碰撞箱/范围键（默认见键位设置）可开关碰撞箱与破坏范围可视化。

原始纹理许可证保留在 `public/assets/LICENSE.txt`。

## 扩展开发

新增方块时：

1. 本体方块在 `public/assets/block/` 下添加 PNG 纹理；插件方块将 PNG 放在自己的 `plugins/<插件ID>/assets/` 下，并使用 `api.asset()` 引用。
2. 本体内容在 `src/i18n.ts` 中添加中英文显示名称；插件方块直接在 `label` 中提供名称。
3. 插件拥有的内容通过 `PluginRegistry.registerBlock()` 注册。使用本体内容时引用 `api.Blocks.MY2DWORLD.STONE`，使用自身内容时引用 `api.Blocks.<PLUGIN_ID>.MY_BLOCK` 或注册结果的 `.id`。
4. 只有需要默认出现的方块才加入地形生成或快捷栏逻辑。

新增游戏模式时：

1. 在 `src/modes/` 中新增 `GameMode` 实现。
2. 更新 `createMode()`。
3. 在 `i18n.ts` 中添加本地化模式名称。
4. 游戏状态放在模式对象或 `core/` 中，不应放入 DOM 事件处理器。

调整怪物碰撞箱时：

1. 内置默认值在 `src/core/entity.ts` 的 `MOB_KINDS`。
2. 想按 kind 覆盖（不改代码）：在 `public/hitboxes/<kind>.json` 写入 `{ "halfWidth": 0.3, "height": 0.8, "centerX": 0, "centerY": 0.2 }`，游戏内用 `/reload hitboxes` 生效。
3. 插件运行时用 `api.registerHitbox(kind, config)` 或 `api.setHitboxes({...})` 覆盖，优先级高于文件配置；`/reload plugins` 会清空插件覆盖。

注册插件动画时（覆盖某个动物家族所有 kind 的动画）：

```ts
await api.registerAnimation("cow", "walk", api.asset("animations/cow.walk.myanim"));
```

家族为 `player | zombie | cow | pig`，姿态为 `idle | walk | attack`。`.myanim` 格式与 `public/animations` 下的内置文件相同；相对图片路径相对动画文件所在目录解析。

插件 API、自动加载约定、生命周期和当前限制见 [插件开发文档](./docs/plugin-development-zh.md)。

## 当前范围

当前版本覆盖 Python 项目的主动玩家和世界流程，并引入了实体系统：

- **程序化地形与区块流送**：无限横向世界，`Y=-64` 基岩到 `Y=320` 建造上限，五个群系（平原/森林/沙漠/雪原/山地）、树木、仙人掌、岩石与多种矿石（含深层变种）。
- **玩家系统**：物理、碰撞、二段跳、飞行、创造/旁观模式、方块破坏与放置、纹理粒子、灵魂出窍（`F7`）。
- **实体系统**：按群系刷新的僵尸/僵尸猪/奶牛等 Mob，含 AI（索敌、追击、攻击）、`/summon` 持久召唤、可配置碰撞箱与 `.myanim` 动画文件。
- **持久化**：账号、设置、世界列表、只存脏区块的世界存档、日志文件。
- **扩展**：插件系统（方块、游戏事件、消息、动画、碰撞箱）、聊天命令、菜单、中英文界面。
- 未来背包系统尚未接入运行循环，但相关纹理已包含在 `public/assets/entity/` 中。
