/// <reference path="./my2dworld-plugin-api.d.ts" />

/**
 * 自动加载示例。保留或删除此文件不会影响核心游戏。
 * 插件目录内的每个 .mjs 文件都会在浏览器启动时被扫描和加载。
 */
export default {
    id: "example-plugin",
    name: "示例插件",
    version: "1.0.0",
    authors: ["My2DWorld"],
    description: "展示自动加载插件和游戏生命周期钩子。",

    /** @param {PluginApi} api */
    install(api) {
        api.onGameStart((context) => {
            console.info(`[ExamplePlugin] ${context.meta.name} started`);
            context.messages.chat("Example plugin online", {color: "#8be9fd"});
            context.messages.title("My2DWorld", {color: "#f2ca52", subtitle: "Example plugin loaded", subtitleColor: "#d8edda"});
        });
        api.onGameStop((context) => console.info(`[ExamplePlugin] ${context.meta.name} stopped: ${context.reason}`));
        api.onBlockPlaced((context) => {
            const block = context.world.getBlock(context.x, context.y);
            if (block && block.id === api.Blocks.DIRT.id) {
                context.messages.chat("Dirt placed!", {color: "#3b85b3"});
            }
        });
    }
};
