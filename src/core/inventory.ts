// 背包格子的纯规则（不依赖 DOM）：拖动均分。
// 放在 core 里是为了让「均分」这条规则可以被单独验证，main.ts 只负责鼠标事件与读写格子。

/**
 * 把 `count` 个物品尽量均分到各目标格，返回每一格应放入的数量。
 *
 * 规则：每格先分 `floor(count / n)` 个，余数 `count % n` 个从前面的格子开始各多放 1 个
 * （所以 64 个分 3 格是 22/21/21，而不是 21/21/21 剩 1 个）；每格再受自己的剩余容量
 * `rooms[i]` 限制，**放不下的部分不会挪到别的格子**——它们的总数就是 `count` 减去返回值之和，
 * 由调用方留在鼠标上。
 */
export function distributeStack(count: number, rooms: readonly number[]): number[] {
    const n = rooms.length;
    if (n === 0) return [];
    const total = Math.max(0, Math.floor(count));
    const shares: number[] = [];
    let remaining = total;
    const base = Math.floor(total / n);
    const extra = total % n;
    for (let i = 0; i < n; i += 1) {
        const room = Math.max(0, Math.floor(rooms[i] ?? 0));
        const want = Math.min(remaining, base + (i < extra ? 1 : 0));
        const give = Math.max(0, Math.min(want, room));
        shares.push(give);
        remaining -= give;
    }
    return shares;
}
