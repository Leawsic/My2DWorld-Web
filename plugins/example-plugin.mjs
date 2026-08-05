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

    install(api) {
        api.onGameStart((context) => console.info(`[ExamplePlugin] ${context.meta.name} started`));
        api.onGameStop((context) => console.info(`[ExamplePlugin] ${context.meta.name} stopped: ${context.reason}`));
    }
};
