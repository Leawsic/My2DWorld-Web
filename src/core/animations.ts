// .myanim 动画加载器：从 /animations/ 目录（public/animations）加载并缓存动画文件。
// 动画按「<类型>/<姿态>.myanim」命名，例如 player/walk.myanim、zombie/idle.myanim；
// 四足动物按「<家族>/<家族>_<姿态>.myanim」命名，例如 cow/cow_stand.myanim、pig/pig_walk.myanim。

import {Animation, type AnimDef} from "./anim";

export const ANIMATIONS_BASE = "/animations";

const cache = new Map<string, Animation | null>();
const inflight = new Map<string, Promise<Animation | null>>();

/** 加载 /animations/<path> 下的动画文件；不存在或解析失败时返回 null。图片解码完成后才返回。 */
export async function loadAnimation(path: string): Promise<Animation | null> {
    const absolute = new URL(`${ANIMATIONS_BASE}/${path}`, location.href).href;
    const cached = cache.get(absolute);
    if (cached !== undefined) return cached;
    let pending = inflight.get(absolute);
    if (!pending) {
        pending = (async () => {
            try {
                const res = await fetch(absolute);
                if (!res.ok) return null;
                const def = (await res.json()) as AnimDef;
                const baseUrl = absolute.slice(0, absolute.lastIndexOf("/") + 1);
                const animation = new Animation(def, baseUrl);
                await Promise.all([...animation.images.values()].map((img) => (img.decode?.() ?? Promise.resolve()).catch(() => {})));
                return animation;
            } catch {
                return null;
            }
        })();
        inflight.set(absolute, pending);
    }
    const result = await pending;
    inflight.delete(absolute);
    cache.set(absolute, result);
    return result;
}

/** 加载任意绝对 URL 的动画文件（插件资源使用）；不存在或解析失败时返回 null。 */
export async function loadAnimationUrl(url: string): Promise<Animation | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const def = (await res.json()) as AnimDef;
        const baseUrl = url.slice(0, url.lastIndexOf("/") + 1);
        const animation = new Animation(def, baseUrl);
        await Promise.all([...animation.images.values()].map((img) => (img.decode?.() ?? Promise.resolve()).catch(() => {})));
        return animation;
    } catch {
        return null;
    }
}

/** 字符动画 key：`<家族>/<姿态>`，例如 `player/walk`、`cow/stand`。 */
export function characterAnimKey(family: string, pose: string): string {
    return `${family}/${pose}`;
}

/**
 * 根据服务端清单（/api/animations 返回的 .myanim 相对路径列表）预加载字符动画。
 * 约定：public/animations/<家族>/<姿态>.myanim 对应角色的姿态；cow/pig 命名含家族前缀，
 * 如 cow/cow_stand.myanim 规约为 key `cow/stand`。
 * 返回加载成功的 `<家族>/<姿态>` → Animation 映射（失败的 key 不会出现）。
 */
export async function loadCharacterAnimations(manifest: string[]): Promise<Map<string, Animation>> {
    const loaded = new Map<string, Animation>();
    await Promise.all(manifest.map(async (file) => {
        const match = /^([^/]+)\/([^/]+)\.(myanim|json)$/i.exec(file);
        if (!match) return;
        const family = match[1].toLowerCase();
        let pose = match[2].toLowerCase();
        if (pose.startsWith(family + "_")) pose = pose.slice(family.length + 1);
        const animation = await loadAnimation(file);
        if (animation) loaded.set(characterAnimKey(family, pose), animation);
    }));
    return loaded;
}
