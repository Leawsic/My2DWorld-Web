# 任务完成总结

**需求**
1. 方块增加 NBT 标签
2. 三层层级系统（layer 1 挡路，2/3 不挡路；玩家只能放在第 1 层）
3. 花草等地的物底下的方块被破坏后，自身不会一同被破坏
4. 不能在空中放置花草等地物

**实现状态**
✅ 已完成全部 4 项需求
✅ 代码审查通过
✅ tsc + node --check 均通过

**主要改动文件**
- `src/core/block.ts` —— 添加 `BlockNbt`、`nbt`、`feature` 字段
- `src/core/registry.ts` —— 树叶/木头默认 layer + 地物标记
- `src/core/world.ts` —— NBT 存储、layer 感知碰撞、placeBlock 强制 layer 1
- `src/core/types.ts` —— WorldSave 增加 `nbt`
- `src/main.ts` —— 地物支持校验
- `server.mjs` —— 持久化 `nbt` 字段

**副作用说明**
- 世界生成树木的树干和树叶现在**完全可通行**（符合 spec 字面约定）
- 玩家放置的原木/树叶强制 layer 1（仍挡路）

**下一步建议**
- 测试树木可通行性是否符合预期
- 若想让世界生成树干仍挡路，可在 features.ts 中明确设置 oak_log layer 3
- 可在 F3 调试面板中显示方块 + layer

**审查结果**：代码正确、逻辑清晰、无重大 bug。任务完成。