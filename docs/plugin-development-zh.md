# My2DWorld Web 插件开发文档

## 概述

当前插件系统是一个面向源码集成的轻量扩展接口，定义在 `src/plugins/api.ts`。它允许插件注册方块定义，并在世界实例创建完成时执行初始化逻辑。

插件不是浏览器运行时自动扫描、动态下载或从 `run/` 目录加载的脚本。要启用插件，需要将插件源码纳入 Web 工程，并在应用启动阶段调用 `plugins.use()`。这个边界是当前实现的一部分，文档中的示例不应被理解为支持外部 JavaScript 插件包。

## 可用接口

```ts
export interface BlockDefinition {
  id: BlockType;
  color: string;
  label: { zh: string; en: string };
}

export interface GamePlugin {
  id: string;
  name: string;
  install(api: PluginApi): void;
}

export interface PluginApi {
  registerBlock(definition: BlockDefinition): void;
  onWorldCreated(listener: (world: World) => void): void;
}
```

`PluginRegistry` 实现了 `PluginApi`，并由应用创建。在每次打开一个世界时，游戏会先恢复保存的方块状态，再调用已注册的 `onWorldCreated` 回调。

## 创建插件

在 `src/plugins/` 下创建模块，例如 `src/plugins/example-plugin.ts`：

```ts
import type { GamePlugin } from "./api";

export const examplePlugin: GamePlugin = {
  id: "example-blocks",
  name: "示例方块",

  install(api) {
    api.registerBlock({
      id: "example_block",
      color: "#8fbc6a",
      label: {
        zh: "示例方块",
        en: "Example Block"
      }
    });

    api.onWorldCreated((world) => {
      world.placeBlock(0, world.getSurfaceHeight(0) + 1, "example_block");
    });
  }
};
```

然后在 `src/main.ts` 的 `PluginRegistry` 创建位置附近导入并安装：

```ts
import { examplePlugin } from "./plugins/example-plugin";

const plugins = new PluginRegistry();
plugins.use(examplePlugin);
```

插件标识符 `id` 应稳定且唯一，推荐使用小写的短横线命名。`name` 用于面向用户或开发者的显示名称；目前核心界面没有插件列表，但仍建议提供清晰名称，便于后续扩展。

## 注册方块

`registerBlock()` 会将方块定义存入注册表。如果多个插件注册同一个 `id`，会立即抛出 `Block already registered` 错误。因此方块 ID 应使用具有插件归属的名称，例如 `example_block` 或 `myplugin_crystal`。

方块定义包含三个字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 方块的稳定标识符，同时也是世界存档中放置方块保存的值。|
| `color` | 供未加载纹理时使用的后备颜色。|
| `label.zh` / `label.en` | 中文和英文显示名称。|

注册定义本身不会自动完成以下工作：

- 不会自动添加纹理加载规则。
- 不会自动加入创造模式快捷栏。
- 不会自动加入地形生成。
- 不会为已有世界生成或迁移方块。

如果方块需要纹理，在 `public/assets/block/` 放置对应 PNG，并在渲染或资源加载逻辑中明确使用它。若方块需要默认可被选择，还需要修改 `src/main.ts` 中创造模式快捷栏定义。修改世界生成规则应在 `src/core/world.ts` 中完成，并评估对已有存档的影响。

## 世界创建钩子

使用 `onWorldCreated()` 可以在每个世界实例恢复完成后执行代码：

```ts
api.onWorldCreated((world) => {
  const surfaceY = world.getSurfaceHeight(12);
  world.placeBlock(12, surfaceY + 1, "example_block");
});
```

回调会在每次进入世界时运行，而不只是在第一次创建世界时运行。因此必须保证逻辑可重复执行：应在写入前检查方块状态，或只执行不改变持久数据的初始化。无条件写入同一坐标会在每次重新进入时覆盖玩家修改。

钩子接收 `World` 实例，可调用其公开方法读取地表高度或设置方块。不要保存跨会话的 `World` 引用，也不要假设回调能访问玩家、Canvas、DOM 或聊天界面；这些对象不属于当前插件 API 契约。

## 方块类型与类型检查

`BlockDefinition.id` 使用 `BlockType` 类型。添加新方块时，需要同步扩展 `src/core/types.ts` 中的 `BlockType` 联合类型；否则 TypeScript 会拒绝插件定义和对 `world.placeBlock()` 的调用。

这是一项有意的编译期约束：它确保新方块能被渲染、存档和游戏规则相关代码明确处理。完成修改后运行：

```bash
npm run build
```

## 推荐实践

- 保持插件安装过程同步、短小且无副作用。
- 为插件拥有的方块使用不与核心方块冲突的稳定 ID。
- 将显示文本同时提供中文和英文。
- 对会写入世界的钩子保持幂等，避免每次进入世界时破坏玩家建筑。
- 将玩法规则放在 `core/` 或独立模式中；插件模块只负责注册和连接扩展点。
- 每次增加方块或修改世界逻辑后执行 `npm run build`，并手动新建和重新进入世界验证存档行为。

## 当前限制与后续扩展方向

当前插件 API 仅提供方块注册和世界创建钩子。以下能力尚未实现：

- 从目录自动发现、启用或禁用插件。
- 独立插件包、版本管理或依赖解析。
- 插件沙箱和权限控制。
- 方块行为、合成配方、实体、事件总线和自定义 UI。
- 将插件注册方块自动接入纹理、创造快捷栏、地形生成和存档迁移。

新增接口时，应先定义稳定的 `PluginApi` 契约，再由 `PluginRegistry` 实现，并在 `main.ts` 中明确生命周期调用位置。这样可以避免插件直接耦合浏览器界面或游戏内部字段。
