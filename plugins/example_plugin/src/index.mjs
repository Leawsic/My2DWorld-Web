/// <reference path="../../my2dworld-plugin-api.d.ts" />

/**
 * A directory plugin package. Runtime code and assets remain under this
 * package so it can later be packed without changing import paths.
 */
export default {
    id: "example_plugin",
    name: "示例插件",
    version: "1.0.0",
    authors: ["My2DWorld"],
    description: "展示目录插件包、命名空间和游戏生命周期钩子。",

    /** @param {PluginApi} api */
    install(api) {
        const marker = api.registerBlock({
            id: "example_marker",
            color: "#8be9fd",
            label: {zh: "示例标记", en: "Example Marker"},
        });

        api.onGameStart((context) => {
            console.info(`[ExamplePlugin] ${context.meta.name} started in ${api.namespace}`);
            context.messages.chat("Example plugin online", {color: "#8be9fd"});
            context.messages.title("My2DWorld", {
                color: "#f2ca52",
                subtitle: "Example plugin loaded",
                subtitleColor: "#d8edda"
            });
        });
        api.onGameStop((context) => console.info(`[ExamplePlugin] ${context.meta.name} stopped: ${context.reason}`));
        api.onBlockPlaced((context) => {
            const block = context.world.getBlock(context.x, context.y);
            if (block?.id === api.Blocks.MY2DWORLD.DIRT.id) {
                context.messages.chat("Dirt placed!", {color: "#3b85b3"});
            }
            if (context.type === marker.id) context.messages.chat("Example marker placed", {color: "#8be9fd"});
        });
    }
};
