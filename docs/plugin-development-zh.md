# My2DWorld Web 插件开发文档

## 插件加载方式

My2DWorld Web 使用接近 Minecraft 模组加载的目录约定：服务启动时会确保 `web/plugins/` 存在；浏览器启动时请求插件清单，自动加载其中所有直接位于该目录下的 `.mjs` 文件。文件名按字母排序加载。

插件是浏览器端 ESM 模块。每个模块必须通过 `default` 导出或具名 `plugin` 导出一个插件对象。单个插件导入或安装失败会写入日志并在浏览器控制台报错，但不会阻止其他插件和游戏继续加载。

```text
web/
└── plugins/
    ├── example-plugin.mjs
    └── my-blocks.mjs
```

插件目录不递归扫描，只加载 `.mjs` 普通文件。服务只会将这个目录中的文件通过 `/plugins/<文件名>` 提供给浏览器，禁止路径遍历。

## IDE 自动补全与游戏对象常量

插件目录附带 `my2dworld-plugin-api.d.ts`。每个插件文件的第一行加入：

```js
/// <reference path="./my2dworld-plugin-api.d.ts" />
```

并在 `install` 前加入 `/** @param {PluginApi} api */`。此后 IDE 会将 `api` 识别为游戏 API，并为 `api.Blocks.DIRT`、`api.Blocks.DIAMOND_BLOCK`、`context.world`、`context.player` 等提供真实对象补全，不会再把 i18n 文案 ID 作为候选。

内置对象采用 MC 风格的大写常量：

```js
api.Blocks.DIRT
api.Blocks.GRASS_BLOCK_SIDE
api.GameModes.CREATIVE
```

对于由其他插件注册、在编辑时无法确定的方块，使用 `api.block("plugin:block_id")`。该方法找不到 id 时会直接抛出明确错误；若希望自行处理不存在的情况，使用 `api.getBlock(id)`。

## 最小插件

创建 `web/plugins/my-plugin.mjs`：

```js
/// <reference path="./my2dworld-plugin-api.d.ts" />

export default {
  id: "my-plugin",
  name: "我的插件",
  version: "1.0.0",
  authors: ["开发者名称"],
  description: "一个自动加载的 My2DWorld 插件。",
  website: "https://example.com/my-plugin",

  /** @param {PluginApi} api */
  install(api) {
    api.onGameStart((context) => {
      console.info(`[my-plugin] 进入世界：${context.meta.name}`);
    });
  }
};
```

`id` 和 `name` 是必填项。`id` 必须在所有已加载插件中唯一，推荐使用小写短横线命名，例如 `my-plugin`。`version`、`authors`、`description` 和 `website` 是可选元数据，供日志、插件管理界面和未来兼容性检查使用。

目前插件元数据会保存在运行时注册表中，但游戏尚未提供插件列表界面，也未实现版本依赖解析、签名校验或沙箱。插件与游戏运行在同一个浏览器上下文中，因此只能安装可信插件。

## 方块注册

在 `install()` 中使用 `registerBlock()` 注册插件方块：

```js
export const plugin = {
  id: "crystal-content",
  name: "水晶内容",
  authors: ["开发者名称"],
  description: "增加一个水晶方块。",

  install(api) {
    api.registerBlock({
      id: "crystal_block",
      color: "#71e4e1",
      label: {
        zh: "水晶方块",
        en: "Crystal Block"
      }
    });
  }
};
```

同一个方块 ID 只能注册一次，冲突会抛出错误并导致该插件加载失败。方块 ID 是存档中放置方块的持久值，因此发布后不应随意改名。

注册方块后，游戏会在进入世界时自动尝试加载 `/assets/block/<方块ID>.png`。对应纹理应放在 `public/assets/block/`，例如：

```text
public/assets/block/crystal_block.png
```

纹理未加载时会使用 `color` 作为后备颜色。注册方块不会自动加入创造模式快捷栏、地形生成或存档迁移；这三类行为当前仍需要修改核心游戏代码。插件方块可以由生命周期回调使用 `world.placeBlock()` 写入世界。

## 生命周期 API

`install(api)` 中可注册以下监听器。插件回调有异常时会输出到浏览器控制台，但注册表会隔离异常，使核心游戏循环继续运行。

| 方法 | 触发时机 |
| --- | --- |
| `onWorldCreated(listener)` | 世界对象创建、存档状态恢复后。参数仅为 `world`。 |
| `onGameStart(listener)` | 进入世界、玩家和模式初始化完成后。 |
| `onGameTick(listener)` | 每个未暂停且聊天框未打开的游戏帧。 |
| `onGamePause(listener)` | 通过 `Esc` 打开暂停菜单时。 |
| `onGameResume(listener)` | 关闭暂停菜单并恢复游戏时。 |
| `onGameModeChanged(listener)` | 通过快捷键或 `/gamemode` 切换模式后。 |
| `onBlockBroken(listener)` | 创造模式成功破坏一个方块后。 |
| `onBlockPlaced(listener)` | 创造模式成功放置一个方块后。 |
| `onPlayerRespawn(listener)` | 玩家因坠入虚空而重生后。 |
| `onGameStop(listener)` | 返回世界列表或浏览器页面卸载前。 |
| `onSpectateChanged(listener)` | 创造模式按 `F7` 切换灵魂出窍时。 |
| `onFlyChanged(listener)` | 玩家飞行状态变化时（双击 `Space` 切换、坠入虚空重生等）。 |

除 `onWorldCreated` 外，生命周期回调都会收到游戏上下文：

```js
api.onGameTick((context) => {
  const { username, meta, world, player, mode, spectate, flying, dt } = context;
  // username: 当前用户名
  // meta: 当前世界元数据，包括 id、名称、模式和物理参数
  // world: 当前 World 实例
  // player: 当前 Player 实例
  // mode: 当前模式名称
  // spectate: 是否处于灵魂出窍状态（玩家本体冻结）
  // flying: 玩家当前是否在飞行
  // dt: 本帧秒数，仅 onGameTick 提供
});
```

方块事件额外提供 `x`、`y` 和 `type`。模式切换事件额外提供 `previousMode` 和切换后的 `mode`。游戏停止事件额外提供 `reason`，当前可能值为 `world-list` 或 `browser-unload`。灵魂出窍事件额外提供切换后的 `spectate` 布尔值；飞行事件额外提供切换后的 `flying` 布尔值。

## 生命周期示例

```js
export default {
  id: "world-greeter",
  name: "世界问候",
  version: "1.0.0",
  authors: ["开发者名称"],
  description: "在世界加载时放置一个标记方块。",

  install(api) {
    api.registerBlock({
      id: "greeting_marker",
      color: "#f2ca52",
      label: { zh: "问候标记", en: "Greeting Marker" }
    });

    api.onWorldCreated((world) => {
      const y = world.getSurfaceHeight(12) + 1;
      world.placeBlock(12, y, "greeting_marker");
    });

    api.onBlockPlaced((context) => {
      if (context.type === "greeting_marker") {
        console.info(`标记放置在 ${context.x}, ${context.y}`);
      }
    });

    api.onGameStop((context) => {
      console.info(`世界结束：${context.meta.name}，原因：${context.reason}`);
    });
  }
};
```

`onWorldCreated` 在每次进入世界时都会运行，不只在首次创建世界时运行。涉及世界写入的钩子应保持幂等，例如先检查 `world.getBlock(x, y)` 再放置，避免重复进入世界时覆盖玩家建筑。

## Registry 对象注册表

游戏对象统一通过注册表暴露。插件的 `install(api)` 会收到两个只读命名空间：

- `api.Blocks`：方块对象，例如 `api.Blocks.DIRT`、`api.Blocks.DIAMOND_BLOCK`。
- `api.GameModes`：游戏模式对象，例如 `api.GameModes.CREATIVE`、`api.GameModes.SPECTATOR`。

注册表对象使用 `.id` 作为存档和世界数据中的稳定值，不要把对象本身写入存档：

```js
api.onBlockPlaced((context) => {
  if (context.type === api.Blocks.DIRT.id) {
    console.info("放置了泥土");
  }
});

api.onGameModeChanged((context) => {
  if (context.mode === api.GameModes.CREATIVE.id) {
    console.info("进入创造模式");
  }
});
```

插件方块使用 `registerBlock()` 注册后，会同时出现在 `api.Blocks` 中。命名空间名称由 id 转换为大写键名，例如 `my_block` 变为 `MY_BLOCK`。重复 id 会被拒绝，以避免不同插件覆盖已有对象。

```js
api.registerBlock({
  id: "crystal_block",
  color: "#8be9fd",
  label: { zh: "水晶块", en: "Crystal Block" }
});

api.onBlockPlaced(({ type }) => {
  if (type === api.Blocks.CRYSTAL_BLOCK.id) {
    console.info("放置了水晶块");
  }
});
```

`api.Registries` 提供底层注册表集合：`api.Registries.blocks` 和 `api.Registries.gameModes`。核心代码从 `src/registry.ts` 导出 `Blocks`、`GameModes`、`Registries`、`blockRegistry` 和 `gameModeRegistry`。每个注册表的 `get(id)`、`has(id)`、`list()` 方法可用于动态查找和枚举对象。

运行时对象通过插件上下文提供：`context.world` 是当前 `World`，`context.player` 是当前 `Player`。`World.getBlock(x, y)` 返回对应的 `Block` 实例，实例包含 `id`、`x`、`y`、`color`、`label` 和 `definition`；需要保存或传递类型 ID 时使用 `block.id`。`World.getBlockId(x, y)` 适用于只需要查询类型的代码。`BlockDefinition` 描述注册表中的共享类型，`Block` 描述放置到世界中的具体实例。

```js
api.onGameTick(({world, player}) => {
  const block = world.getBlock(Math.floor(player.x), Math.floor(player.y));
  if (block) console.info(`${block.id} at ${block.x},${block.y}`);
});
```

## 玩家消息 API

插件可以通过 `api.messages` 或生命周期回调中的 `context.messages` 向当前玩家发送消息。消息仅在玩家已进入世界时显示；颜色必须为 `#RRGGBB`，非法颜色会回退为白色。

```js
api.onGameStart((context) => {
  context.messages.chat("欢迎进入水晶世界", { color: "#8be9fd" });
  context.messages.title("水晶世界", {
    color: "#f2ca52",
    subtitle: "新的旅程开始了",
    subtitleColor: "#d8edda",
    duration: 4
  });
});
```

`chat(text, options)` 会将文字加入游戏聊天框，聊天框关闭时按正常规则淡出。`title(title, options)` 会在屏幕中央显示标题和可选副标题；`duration` 单位为秒，范围会被限制在 0.5 到 15 秒。

## 可用 World 操作

当前插件可以使用 `World` 的公开方法：

```js
const block = world.getBlock(x, y);
const placed = world.placeBlock(x, y, "crystal_block");
const broken = world.breakBlock(x, y);
const surfaceY = world.getSurfaceHeight(x);
world.updateView(cameraX);
```

`placeBlock()` 在目标位置已有方块或 `y < 1` 时会返回 `false`。不应直接修改 `chunks`、`brokenBlocks` 或 `placedBlocks`，这些字段属于核心世界状态，直接修改可能破坏区块加载和存档语义。

## 日志和调试

服务器每次启动会在 `run/logs/` 创建独立日志文件。插件扫描、插件加载失败和浏览器上报的游戏事件都会出现在该目录的日志中。插件自身可使用 `console.info`、`console.warn` 和 `console.error`，以便在浏览器开发者工具中查看诊断信息。

当前 API 未向插件暴露专用日志函数。插件不应直接调用游戏的私有存储接口，也不应依赖未公开的 DOM 结构。

## 当前限制

- 只支持同目录下的浏览器 ESM `.mjs` 插件，不支持 CommonJS、TypeScript 源文件或递归目录扫描。
- 插件没有依赖解析、启用/禁用配置、权限控制、签名或沙箱。
- 插件不能当前版本中自定义游戏模式、命令、用户界面、实体 AI、合成配方或网络逻辑。
- 注册的方块不会自动加入快捷栏或程序化地形。
- 插件 API 的类型定义在 `src/plugins/api.ts`，外部 `.mjs` 插件在运行时通过结构化对象接入；需要强类型开发时，应在本工程内创建 TypeScript 插件模块并通过相同 API 注册。

新增插件接口时，应先扩展 `PluginApi` 和 `PluginRegistry`，再在 `main.ts` 的明确生命周期位置触发通知。这样可以保持插件与核心 UI、渲染和持久化实现之间的边界清晰。
