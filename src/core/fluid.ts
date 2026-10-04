import {Block} from "./block";
import {blockRegistry} from "./registry";
import {WORLD_MIN_Y, World} from "./world";

/** 水方块 ID（命名空间形式）。 */
export const WATER_ID = "my2dworld:water";
/** 岩浆方块 ID（命名空间形式）。 */
export const LAVA_ID = "my2dworld:lava";
/** 水的最高液面等级：0 为水源（最高），7 为最低，流动到 7 后停止。 */
export const WATER_MAX_LEVEL = 7;
/** 两次流体传播之间的间隔（秒），对应「每 N 帧传播一次」。 */
export const FLUID_TICK_INTERVAL = 0.2;

/** 是否为流体方块（水或岩浆）。 */
export function isFluid(id: string | null | undefined): boolean {
    return id === WATER_ID || id === LAVA_ID;
}

/** 流体的渲染颜色（半透明蓝为水，橙为岩浆）。 */
export function fluidColor(id: string): string {
    return id === LAVA_ID ? "rgba(214, 84, 32, .9)" : "rgba(56, 120, 216, .72)";
}

export interface FluidState {
    level: number;
    falling: boolean;
}

/** 读取某格流体的状态；非流体返回 null。 */
export function fluidStateAt(world: World, x: number, y: number): FluidState | null {
    const id = world.getBlockId(x, y);
    if (!id || !isFluid(id)) return null;
    const nbt = world.nbtAt(x, y);
    const level = typeof nbt.level === "number" ? Math.max(0, Math.min(WATER_MAX_LEVEL, Math.floor(nbt.level))) : 0;
    return {level, falling: nbt.falling === true};
}

/**
 * 2D 流体传播（水 / 岩浆，原版 3D 流体逻辑的降维简化）：
 *  - 水平流动：从水源（level 0）出发，在平整液面左右各传播最多 7 格，每格 level +1；
 *  - 垂直下落：源正下方为空气时向下补水柱（falling），落地后从液面继续水平传播；
 *  - 每 tick 先垂直后水平；非水源的流动水在下个传播周期被清除（水源被移除后自然消失）。
 * 水平扩展要求目标格下方有支撑（简化：水不主动越过悬空的边缘，悬空边缘靠垂直下落规则补充）。
 */
export class FluidSimulator {
    private accumulator = 0;

    update(world: World, dt: number): void {
        this.accumulator += dt;
        while (this.accumulator >= FLUID_TICK_INTERVAL) {
            this.accumulator -= FLUID_TICK_INTERVAL;
            this.runTick(world);
        }
    }

    /** 立即执行一次完整传播（/fill 放置流体后调用，让结果即时可见）。 */
    tickNow(world: World): void {
        this.runTick(world);
    }

    private runTick(world: World): void {
        // 1. 收集所有水源/岩浆源（level 0 且非下落），并记录所有流体格。
        const sources: Array<[number, number, string]> = [];
        const allFluid: Array<[number, number]> = [];
        world.scanBlocks((x, y, type) => {
            if (!isFluid(type)) return;
            allFluid.push([x, y]);
            const state = fluidStateAt(world, x, y);
            if (state && state.level === 0 && !state.falling) sources.push([x, y, type]);
        });
        // 2. 清除所有派生流体（level > 0 或下落中），源保持不变；下一步从源重新推导。
        for (const [x, y] of allFluid) {
            const state = fluidStateAt(world, x, y);
            if (state && (state.level > 0 || state.falling)) world.clearBlock(x, y);
        }
        // 3. 从每个源重新推导；先写入临时计划，避免遍历与写入互相干扰。
        const planned = new Map<string, {type: string; level: number; falling: boolean}>();
        const plan = (x: number, y: number, type: string, level: number, falling: boolean): void => {
            const key = `${x},${y}`;
            const existing = planned.get(key);
            if (existing && existing.type !== type) return; // 水×岩浆相遇：交给后续转换
            if (!existing || level < existing.level || (level === existing.level && falling && !existing.falling)) {
                planned.set(key, {type, level, falling});
            }
        };
        for (const [sx, sy, type] of sources) this.propagate(world, sx, sy, type, plan);
        // 4. 应用计划写入。
        for (const [cell, fluid] of planned) {
            const [x, y] = World.parseCell(cell);
            this.setFluid(world, x, y, fluid.type, fluid.level, fluid.falling);
        }
        // 5. 水×岩浆交互：岩浆遇水转成黑曜石（岩浆源）或圆石（流动岩浆）。
        this.resolveWaterLava(world);
    }

    /** 从源向下找落点，补下落水柱，并在落点液面做水平扩散。 */
    private propagate(world: World, sx: number, sy: number, type: string, plan: (x: number, y: number, type: string, level: number, falling: boolean) => void): void {
        let restY = sy;
        while (true) {
            const below = restY - 1;
            if (below < WORLD_MIN_Y || world.getBlockId(sx, below) !== null) break;
            restY = below;
        }
        // 源下方直到落点（含落点）都是派生下落水（level 0，falling=true）。
        for (let y = sy - 1; y >= restY; y -= 1) plan(sx, y, type, 0, true);
        this.spread(world, sx, restY, type, plan);
    }

    /** 从液面 (sx, sy) 左右各传播最多 7 格，level 递增；要求目标格下方有支撑。 */
    private spread(world: World, sx: number, sy: number, type: string, plan: (x: number, y: number, type: string, level: number, falling: boolean) => void): void {
        for (const dir of [-1, 1]) {
            let level = 1;
            let x = sx + dir;
            while (level <= WATER_MAX_LEVEL) {
                if (world.getBlockId(x, sy) !== null) break;
                if (world.getBlockId(x, sy - 1) === null) break;
                plan(x, sy, type, level, false);
                level += 1;
                x += dir;
            }
        }
    }

    private setFluid(world: World, x: number, y: number, type: string, level: number, falling: boolean): void {
        const definition = blockRegistry.get(type);
        if (!definition) return;
        const block = new Block(definition, x, y, {level: Math.max(0, Math.min(WATER_MAX_LEVEL, Math.floor(level))), falling});
        world.setBlock(x, y, block);
    }

    private resolveWaterLava(world: World): void {
        const converts: Array<[number, number, string]> = [];
        world.scanBlocks((x, y, type) => {
            if (type !== LAVA_ID) return;
            if (!this.adjacentTo(world, x, y, WATER_ID)) return;
            const state = fluidStateAt(world, x, y);
            const flowing = !state || state.level > 0 || state.falling;
            converts.push([x, y, flowing ? "my2dworld:cobblestone" : "my2dworld:obsidian"]);
        });
        for (const [x, y, id] of converts) world.setBlock(x, y, id);
    }

    private adjacentTo(world: World, x: number, y: number, id: string): boolean {
        return world.getBlockId(x - 1, y) === id || world.getBlockId(x + 1, y) === id
            || world.getBlockId(x, y - 1) === id || world.getBlockId(x, y + 1) === id;
    }
}