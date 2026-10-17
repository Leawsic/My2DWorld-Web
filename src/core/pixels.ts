/**
 * 设备像素对齐（Canvas 2D 抗锯齿接缝修复）。
 *
 * 画布后备存储是物理像素（`canvas.width = innerWidth × devicePixelRatio`），绘制时用
 * `ctx.setTransform(dpr, …)` 把 CSS 坐标换算成物理像素。当 `devicePixelRatio` 不是整数时
 * （Windows 125% / 150% 缩放下浏览器报告 1.25 / 1.5），**整数 CSS 坐标会落在半个物理像素上**：
 * 相邻两个 `fillRect` / `drawImage` 各自按覆盖率做抗锯齿，共享的那一行像素两边都只盖住一部分，
 * 背景（天空、上一层的方块）就从中间透出来——在整片平坦的水面上表现为一条条**水平白线**，
 * 陆地因为纹理杂乱不容易察觉；摄像机移动时像素相位变化，线还会闪动/游走。
 *
 * 修法：每一格的左/右/上/下边都单独对齐到物理像素网格，并且**相邻两格用同一个表达式算共享边**
 * （右邻的左边 = 本格的右边），于是所有边都精确落在物理像素边界上：既不重叠（不然半透明水会变深）
 * 也不留缝（不然会透出背景）。`dpr` 为 1 / 2 / 3 等整数时这些函数等同恒等变换，行为与改动前一致。
 */

/** 把 CSS 坐标对齐到设备像素网格（返回 CSS 单位的对齐结果）。 */
export function snapToDevice(value: number, dpr: number): number {
    return Math.round(value * dpr) / dpr;
}

/**
 * 从 CSS 坐标 `start` 开始、边长 `size` 的一段，在设备像素网格上的实际长度（CSS 单位）。
 * `snapToDevice(start) + deviceSpanSize(start, size, dpr)` 一定等于 `snapToDevice(start + size, dpr)`，
 * 因此相邻两段（`start` 与 `start + size`）的共享边完全重合。
 */
export function deviceSpanSize(start: number, size: number, dpr: number): number {
    return snapToDevice(start + size, dpr) - snapToDevice(start, dpr);
}

/** 半透明色块的边界是否可能产生抗锯齿接缝（dpr 非整数时为真，用于文档与探针）。 */
export function needsDeviceSnap(dpr: number): boolean {
    return !Number.isInteger(dpr);
}
