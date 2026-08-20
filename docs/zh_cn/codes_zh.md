# My2DWorld-Web 代码功能说明（中文版）

> **项目路径**：`D:\Project\My2DWorld-Web`
> **技术栈**：TypeScript + Vite + Canvas 2D + Node.js 中间件
> **游戏模式**：2D 像素风沙盒游戏（类似简易版 Minecraft）

---

## 核心文件

### `src/main.ts`
**功能**：游戏主入口文件，负责初始化 Canvas 渲染、事件绑定（键盘、鼠标、滚轮）、聊天系统、物品栏/背包交互、游戏模式切换（创造/旁观）、插件加载、世界保存、游戏循环等。

**关键模块**：
- `GameSession` 类：游戏会话核心，管理世界、玩家、实体、HUD 等
- 背包系统：3×9 网格 + 9 格快捷栏，支持拖拽、交换、关闭时物品处理
- 聊天系统：支持命令补全、历史记录、滚轮滚动、语法高亮
- 插件系统：支持动态加载 `.mjs` 插件（API 注册方块、游戏事件等）
- 游戏循环：`requestAnimationFrame` 驱动的 `tick` 函数

### `src/core/types.ts`
**功能**：定义所有游戏核心数据类型和默认配置。

**主要接口**：
- `MovementSettings`：行走/飞行/跳跃/重力设置
- `PlayerSettings`：全局玩家设置（语言、快捷键、自动保存等）
- `WorldMeta` / `WorldSave`：世界元数据与存档格式（含物品栏、背包、坐标、模式等）
- 默认值 `DEFAULT_MOVEMENT`、`DEFAULT_SETTINGS`（已更新飞行速度为 7）

### `src/core/entity.ts`
**功能**：生物（Mob）管理与物理交互模块。

**核心功能**：
- 定义所有生物种类（僵尸、牛、猪等）和配置（血量、速度、碰撞箱）
- MobManager：管理已生成生物（chunk-based 自动刷新）
- 挤压伤害系统：支持双轴（水平+竖直）碰撞检测，只有真正重叠才扣血
- 生物 AI（行走、攻击、跳跃）、击杀逻辑、缓慢效果等
- 玩家与生物的相互碰撞处理

### `src/core/physics.ts`
**功能**：共享的轴分离碰撞（AABB）物理引擎。

**核心功能**：
- `moveBody`：带子步长的位移碰撞检测（防穿墙）
- `canShiftX` / `canShiftY`：检查某方向能否移动
- `resolveEntityCollision`：质量加权的弹性碰撞 + 反弹（restitution）
- 用于玩家、生物、实体间的所有物理推开与反弹

### `src/core/player.ts`
**功能**：玩家角色控制与物理模块。

**核心功能**：
- 行走、飞行、跳跃、双击飞行切换
- 受挤压缓慢效果（-20% 速度）
- 碰撞箱尺寸（0.25×1.9）
- 动画时间计算

---

## 其他重要文件

### 方块与世界
- `src/core/block.ts`：方块类型定义、注册、材质加载
- `src/core/world.ts`：世界生成（噪声）、区块加载/保存、方块查询
- `src/core/noise.ts`：Perlin 噪声用于地形生成
- `src/core/structures.ts`：结构（房屋、树等）导出/加载

### 渲染与视觉
- `src/core/skeleton.ts`：玩家角色骨骼动画（Steve 模型）
- `src/core/animations.ts`：角色动画加载与播放
- `src/core/particles.ts`：粒子系统（破坏、血迹等）
- `src/core/hitboxes.ts`：碰撞箱数据（F5 显示用）

### 模式与交互
- `src/modes/base.ts`：游戏模式基类
- `src/modes/creative.ts`：创造模式（无重力、飞行、方块放置）
- `src/modes/spectator.ts`：旁观模式（可穿实体、第三人称）
- `src/modes/index.ts`：模式创建工厂

### 物品栏与 GUI
- `src/core/storage.ts`：游戏存档、设置、插件管理
- `src/core/registry.ts`：方块注册表（含中文名等）
- `src/i18n.ts`：多语言支持（中英切换）
- `src/plugins/api.ts`：插件系统 API

---

## 构建与运行说明

```bash
# 开发模式
npm run dev

# 生产构建
npm run build

# 启动后访问：http://127.0.0.1:5173
```

**已修复内容**：
- 背包物品消失 bug（关闭时正确处理持有的物品）
- 聊天栏滚轮方向与移动方向一致
- 默认飞行速度改为 7
- 挤压伤害改为真正碰撞箱重叠才扣血
- 文档已生成

**文件列表已全部覆盖**（共约 30 个主要源文件）。如需某具体文件更详细说明或修改，请随时告知。