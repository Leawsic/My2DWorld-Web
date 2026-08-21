import {createServer} from "node:http";
import {createHash, randomBytes} from "node:crypto";
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
    unlinkSync,
    appendFileSync
} from "node:fs";
import {dirname, extname, join, normalize, relative, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const run = join(root, "run");
const dirs = {
    accounts: join(run, "accounts"),
    config: join(run, "config"),
    logs: join(run, "logs"),
    worlds: join(run, "worlds"),
    structures: join(run, "structures"),
    plugins: join(root, "plugins")
};
Object.values(dirs).forEach((dir) => mkdirSync(dir, {recursive: true}));
const safe = (value) => String(value || "").replace(/[^\w-]/g, "") || "player";
const timestamp = () => new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
const fileTimestamp = () => timestamp().replace(/:/g, "-").replace(" ", "_");
const logPath = join(dirs.logs, `${fileTimestamp()}.log`);
const log = (level, event, details = {}) => {
    const fields = Object.entries(details).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
    const line = `[${timestamp()}] [${level.toUpperCase()}] ${event}${fields ? ` ${fields}` : ""}`;
    console.log(line);
    try {
        appendFileSync(logPath, `${line}\n`, "utf8");
    } catch (error) {
        console.error(`Failed to write log: ${String(error)}`);
    }
};
appendFileSync(logPath, `${"=".repeat(60)}\nMy2DWorld Web Log - Started at ${timestamp()}\n${"=".repeat(60)}\n`, "utf8");
const readJson = (path, fallback) => {
    try {
        return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
    } catch {
        return fallback;
    }
};
const accountPath = (name) => join(dirs.accounts, `${safe(name)}.json`);
const passwordHash = (password, salt) => createHash("sha256").update(`${salt}${password}`).digest("hex");
if (!existsSync(accountPath("steve"))) {
    const salt = randomBytes(16).toString("hex");
    writeFileSync(accountPath("steve"), JSON.stringify({
        username: "steve",
        password_hash: passwordHash("1234asdf", salt),
        salt
    }, null, 2));
    log("info", "Account initialized", {user: "steve"});
}
const send = (res, status, payload) => {
    res.writeHead(status, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"});
    res.end(JSON.stringify(payload));
    return true;
};
const body = async (req) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    return text ? JSON.parse(text) : {};
};

const safePluginId = (value) => /^[a-z0-9][a-z0-9_]*$/i.test(value) ? value.toLowerCase() : null;
const safeStructureName = (value) => /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(String(value || "")) ? String(value) : null;
const pluginPackages = () => readdirSync(dirs.plugins, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && safePluginId(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
        const id = safePluginId(entry.name);
        const packageDir = join(dirs.plugins, entry.name);
        const manifest = readJson(join(packageDir, "plugin.json"), null);
        if (!manifest || manifest.id !== id || typeof manifest.entry !== "string" || !/^[\w./-]+\.mjs$/.test(manifest.entry)) {
            log("warn", "Plugin package skipped", {package: entry.name, reason: "invalid manifest"});
            return [];
        }
        const entryPath = normalize(join(packageDir, manifest.entry));
        if (!entryPath.startsWith(`${packageDir}${sep}`) || !existsSync(entryPath) || !statSync(entryPath).isFile()) {
            log("warn", "Plugin package skipped", {package: entry.name, reason: "entry missing"});
            return [];
        }
        return [{
            id,
            name: String(manifest.name || id),
            version: typeof manifest.version === "string" ? manifest.version : undefined,
            entry: `/plugins/${encodeURIComponent(id)}/${manifest.entry.split("/").map(encodeURIComponent).join("/")}`
        }];
    });

const api = async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    const user = safe(url.searchParams.get("user"));
    try {
        if (url.pathname === "/api/settings" && req.method === "GET") return send(res, 200, readJson(join(dirs.config, `${user}.json`), {}));
        if (url.pathname === "/api/settings" && req.method === "POST") {
            writeFileSync(join(dirs.config, `${user}.json`), JSON.stringify(await body(req), null, 2));
            log("info", "Settings saved", {user});
            return send(res, 200, {ok: true});
        }
        if (url.pathname === "/api/worlds" && req.method === "GET") return send(res, 200, readJson(join(dirs.worlds, `${user}.json`), {worlds: []}));
        if (url.pathname === "/api/worlds" && req.method === "POST") {
            writeFileSync(join(dirs.worlds, `${user}.json`), JSON.stringify(await body(req), null, 2));
            log("info", "World list saved", {user});
            return send(res, 200, {ok: true});
        }
        const world = safe(url.searchParams.get("world"));
        const savePath = join(dirs.worlds, `${user}_${world}.json`);
        const chunkPrefix = `${user}_${world}.chunk.`;
        const chunkFilePath = (cx, cy) => join(dirs.worlds, `${chunkPrefix}${cx}.${cy}.dat`);
        const listChunkFiles = () => readdirSync(dirs.worlds).filter((file) => file.startsWith(chunkPrefix) && /\.chunk\.-?\d+\.-?\d+\.dat$/.test(file));
        if (url.pathname === "/api/world-save" && req.method === "GET") {
            const state = readJson(savePath, null);
            if (!state) return send(res, 200, null);
            const chunks = {};
            for (const file of listChunkFiles()) {
                const match = file.match(/\.chunk\.(-?\d+)\.(-?\d+)\.dat$/);
                if (!match) continue;
                try {
                    chunks[`${match[1]},${match[2]}`] = readFileSync(join(dirs.worlds, file)).toString("base64");
                } catch (error) {
                    log("warn", "Chunk read failed", {user, world, file, error: String(error)});
                }
            }
            return send(res, 200, {...state, chunks});
        }
        if (url.pathname === "/api/world-save" && req.method === "POST") {
            const data = await body(req);
            writeFileSync(savePath, JSON.stringify({
                playerX: Number(data.playerX) || 0,
                playerY: Number(data.playerY) || 0,
                mode: data.mode === "spectator" ? "spectator" : "creative",
                ...(Number.isFinite(Number(data.spawnX)) && Number.isFinite(Number(data.spawnY)) ? {spawnX: Number(data.spawnX), spawnY: Number(data.spawnY)} : {}),
                ...(data.spawnFacing === 1 || data.spawnFacing === -1 ? {spawnFacing: data.spawnFacing} : {}),
                idTable: Array.isArray(data.idTable) ? data.idTable : [],
                inventorySlots: Array.isArray(data.inventorySlots) ? data.inventorySlots : [],
                hotbar: Array.isArray(data.hotbar) ? data.hotbar : []
            }, null, 2));
            if (data.chunks && typeof data.chunks === "object") {
                for (const [cell, encoded] of Object.entries(data.chunks)) {
                    if (!/^-?\d+,-?\d+$/.test(cell) || typeof encoded !== "string") continue;
                    const [cx, cy] = cell.split(",").map(Number);
                    if (!Number.isInteger(cx) || !Number.isInteger(cy)) continue;
                    try {
                        writeFileSync(chunkFilePath(cx, cy), Buffer.from(encoded, "base64"));
                    } catch (error) {
                        log("warn", "Chunk write failed", {user, world, cell, error: String(error)});
                    }
                }
            }
            log("info", "World saved", {user, world, chunks: Object.keys(data.chunks || {}).length});
            return send(res, 200, {ok: true});
        }
        if (url.pathname === "/api/world-save" && req.method === "DELETE") {
            if (existsSync(savePath)) unlinkSync(savePath);
            for (const file of listChunkFiles()) {
                try {
                    unlinkSync(join(dirs.worlds, file));
                } catch (error) {
                    log("warn", "Chunk delete failed", {user, world, file, error: String(error)});
                }
            }
            log("info", "World save deleted", {user, world});
            return send(res, 200, {ok: true});
        }
        if (url.pathname === "/api/log" && req.method === "POST") {
            const data = await body(req);
            const level = ["info", "warn", "error"].includes(data.level) ? data.level : "info";
            log(level, String(data.event || "Browser event").slice(0, 120), {user, ...(data.details && typeof data.details === "object" ? data.details : {})});
            return send(res, 200, {ok: true});
        }
        if (url.pathname === "/api/plugins" && req.method === "GET") {
            const plugins = pluginPackages();
            log("info", "Plugin scan", {count: plugins.length});
            return send(res, 200, {plugins});
        }
        if (url.pathname === "/api/animations" && req.method === "GET") {
            const animations = [];
            const animationsDir = join(root, "public", "animations");
            const walk = (dir, prefix) => {
                if (!existsSync(dir)) return;
                for (const entry of readdirSync(dir, {withFileTypes: true})) {
                    const rel = prefix + entry.name;
                    const full = join(dir, entry.name);
                    if (entry.isDirectory()) walk(full, `${rel}/`);
                    else if (/\.(myanim|json)$/i.test(entry.name)) animations.push(rel.replace(/\\/g, "/"));
                }
            };
            walk(animationsDir, "");
            animations.sort((a, b) => a.localeCompare(b));
            return send(res, 200, {animations});
        }
        if (url.pathname === "/api/homepage-backgrounds" && req.method === "GET") {
            const bgDir = join(root, "public", "assets", "Homepage_background");
            const backgrounds = existsSync(bgDir)
                ? readdirSync(bgDir).filter((file) => /\.(jpe?g|png|webp)$/i.test(file)).sort((a, b) => a.localeCompare(b))
                : [];
            return send(res, 200, {backgrounds});
        }
        if (url.pathname === "/api/hitboxes" && req.method === "GET") {
            const hitboxes = {};
            const hitboxesDir = join(root, "public", "hitboxes");
            if (existsSync(hitboxesDir)) {
                for (const file of readdirSync(hitboxesDir)) {
                    if (!file.endsWith(".json")) continue;
                    const kind = file.slice(0, -5);
                    const data = readJson(join(hitboxesDir, file), null);
                    // 透传整份配置（含多矩形 boxes 与左右朝向 left/right），由客户端自行归一化校验。
                    if (data && typeof data === "object") hitboxes[kind] = data;
                }
            }
            return send(res, 200, {hitboxes});
        }
        if (url.pathname === "/api/squeeze" && req.method === "GET") {
            const squeeze = {};
            const squeezeDir = join(root, "public", "squeeze");
            if (existsSync(squeezeDir)) {
                for (const file of readdirSync(squeezeDir)) {
                    if (!file.endsWith(".json")) continue;
                    const kind = file.slice(0, -5);
                    const data = readJson(join(squeezeDir, file), null);
                    if (data && typeof data === "object") squeeze[kind] = data;
                }
            }
            return send(res, 200, {squeeze});
        }
        if (url.pathname === "/api/structures" && req.method === "GET") {
            const name = safeStructureName(url.searchParams.get("name"));
            if (name) {
                const struct = readJson(join(dirs.structures, user, `${name}.json`), null);
                return send(res, 200, struct);
            }
            const userDir = join(dirs.structures, user);
            const list = existsSync(userDir)
                ? readdirSync(userDir)
                    .filter((file) => file.endsWith(".json"))
                    .map((file) => {
                        const data = readJson(join(userDir, file), null);
                        return data && typeof data.id === "string" ? {id: data.id, width: Number(data.width) || 0, height: Number(data.height) || 0} : null;
                    })
                    .filter(Boolean)
                : [];
            return send(res, 200, {structures: list});
        }
        if (url.pathname === "/api/structures" && req.method === "POST") {
            const name = safeStructureName(url.searchParams.get("name"));
            const data = await body(req);
            if (!name) return send(res, 400, {error: "Invalid structure name"});
            const width = Number(data.width);
            const height = Number(data.height);
            if (!Number.isInteger(width) || width < 1 || width > 64 || !Number.isInteger(height) || height < 1 || height > 64) return send(res, 400, {error: "Invalid dimensions"});
            const blocks = {};
            if (data.blocks && typeof data.blocks === "object") {
                for (const [key, value] of Object.entries(data.blocks)) {
                    if (!/^-?\d+,-?\d+$/.test(key)) continue;
                    const [sx, sy] = key.split(",").map(Number);
                    if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
                    if (typeof value === "string" && value) blocks[key] = value;
                }
            }
            const userDir = join(dirs.structures, user);
            mkdirSync(userDir, {recursive: true});
            writeFileSync(join(userDir, `${name}.json`), JSON.stringify({id: name, width, height, blocks}, null, 2));
            log("info", "Structure saved", {user, name, blocks: Object.keys(blocks).length});
            return send(res, 200, {ok: true});
        }
        if (url.pathname === "/api/structures" && req.method === "DELETE") {
            const name = safeStructureName(url.searchParams.get("name"));
            if (!name) return send(res, 400, {error: "Invalid structure name"});
            const path = join(dirs.structures, user, `${name}.json`);
            if (existsSync(path)) unlinkSync(path);
            log("info", "Structure deleted", {user, name});
            return send(res, 200, {ok: true});
        }
        if (url.pathname === "/api/account" && req.method === "POST") {
            const data = await body(req);
            const name = safe(data.username);
            const path = accountPath(name);
            const existing = readJson(path, null);
            if (data.action === "register") {
                if (existing) {
                    log("warn", "Register failed", {user: name, reason: "exists"});
                    return send(res, 409, {ok: false, error: "exists"});
                }
                const salt = randomBytes(16).toString("hex");
                writeFileSync(path, JSON.stringify({
                    username: name,
                    password_hash: passwordHash(data.password || "", salt),
                    salt
                }, null, 2));
                log("info", "Register succeeded", {user: name});
                return send(res, 200, {ok: true});
            }
            const success = Boolean(existing && passwordHash(data.password || "", existing.salt) === existing.password_hash);
            log(success ? "info" : "warn", "Login " + (success ? "succeeded" : "failed"), {user: name});
            return success ? send(res, 200, {ok: true, username: name}) : send(res, 401, {ok: false});
        }
        return send(res, 404, {error: "Not found"});
    } catch (error) {
        log("error", "API request failed", {path: url.pathname, error: String(error)});
        return send(res, 500, {error: String(error)});
    }
};

const pluginFile = (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/plugins/") || req.method !== "GET") return false;
    const parts = url.pathname.slice("/plugins/".length).split("/").map(decodeURIComponent);
    const [id, ...resource] = parts;
    const namespace = safePluginId(id);
    if (!namespace || !resource.length || resource.some((part) => !part || part === "." || part === "..")) return send(res, 404, {error: "Plugin resource not found"});
    const packageDir = join(dirs.plugins, namespace);
    const path = normalize(join(packageDir, ...resource));
    if (relative(packageDir, path).startsWith("..") || !existsSync(path) || !statSync(path).isFile()) return send(res, 404, {error: "Plugin resource not found"});
    const mime = {
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".css": "text/css"
    }[extname(path).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {"Content-Type": `${mime}; charset=utf-8`, "Cache-Control": "no-store"});
    res.end(readFileSync(path));
    return true;
};

const vite = await createViteServer({root, server: {middlewareMode: true}});
const server = createServer(async (req, res) => {
    const handled = await api(req, res);
    if (!handled && !res.writableEnded && !pluginFile(req, res)) vite.middlewares(req, res);
});
const port = Number(process.env.PORT || 5173);
server.listen(port, "127.0.0.1", () => log("info", "Server started", {url: `http://127.0.0.1:${port}`, log: logPath}));
