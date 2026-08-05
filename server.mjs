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
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const run = join(root, "run");
const dirs = {
    accounts: join(run, "accounts"),
    config: join(run, "config"),
    logs: join(run, "logs"),
    worlds: join(run, "worlds"),
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
        if (url.pathname === "/api/world-save" && req.method === "GET") return send(res, 200, readJson(savePath, null));
        if (url.pathname === "/api/world-save" && req.method === "POST") {
            writeFileSync(savePath, JSON.stringify(await body(req), null, 2));
            log("info", "World saved", {user, world});
            return send(res, 200, {ok: true});
        }
        if (url.pathname === "/api/world-save" && req.method === "DELETE") {
            if (existsSync(savePath)) unlinkSync(savePath);
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
            const plugins = readdirSync(dirs.plugins).filter((name) => name.endsWith(".mjs") && statSync(join(dirs.plugins, name)).isFile()).sort().map((name) => `/plugins/${encodeURIComponent(name)}`);
            log("info", "Plugin scan", {count: plugins.length});
            return send(res, 200, {plugins});
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
    const name = url.pathname.slice("/plugins/".length);
    if (!/^[\w.-]+\.mjs$/.test(name)) return send(res, 404, {error: "Plugin not found"});
    const path = join(dirs.plugins, name);
    if (!existsSync(path) || !statSync(path).isFile()) return send(res, 404, {error: "Plugin not found"});
    res.writeHead(200, {"Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store"});
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
