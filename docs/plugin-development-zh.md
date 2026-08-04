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

## 最小插件

创建 `web/plugins/my-plugin.mjs`：

```js
export default {
  id: "my-plugin",
  name: "我的插件",
  version: "1.0.0",
  authors: ["开发者名称"],
  description: "一个自动加载的 My2DWorld 插件。",
  website: "https://example.com/my-plugin",

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

除 `onWorldCreated` 外，生命周期回调都会收到游戏上下文：

```js
api.onGameTick((context) => {
  const { username, meta, world, player, mode, dt } = context;
  // username: 当前用户名
  // meta: 当前世界元数据，包括 id、名称、模式和物理参数
  // world: 当前 World 实例
  // player: 当前 Player 实例
  // mode: 当前模式名称
  // dt: 本帧秒数，仅 onGameTick 提供
});
```

方块事件额外提供 `x`、`y` 和 `type`。模式切换事件额外提供 `previousMode` 和切换后的 `mode`。游戏停止事件额外提供 `reason`，当前可能值为 `world-list` 或 `browser-unload`。

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
