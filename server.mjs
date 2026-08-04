import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const run = join(root, "run");
const dirs = { accounts: join(run, "accounts"), config: join(run, "config"), logs: join(run, "logs"), worlds: join(run, "worlds") };
Object.values(dirs).forEach((dir) => mkdirSync(dir, { recursive: true }));
const safe = (value) => String(value || "").replace(/[^\w-]/g, "") || "player";
const readJson = (path, fallback) => { try { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback; } catch { return fallback; } };
const accountPath = (name) => join(dirs.accounts, `${safe(name)}.json`);
const passwordHash = (password, salt) => createHash("sha256").update(`${salt}${password}`).digest("hex");
if (!existsSync(accountPath("steve"))) { const salt = randomBytes(16).toString("hex"); writeFileSync(accountPath("steve"), JSON.stringify({ username: "steve", password_hash: passwordHash("1234asdf", salt), salt }, null, 2)); }
const send = (res, status, payload) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(payload)); return true; };
const body = async (req) => { let text = ""; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; };

const api = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  const user = safe(url.searchParams.get("user"));
  try {
    if (url.pathname === "/api/settings" && req.method === "GET") return send(res, 200, readJson(join(dirs.config, `${user}.json`), {}));
    if (url.pathname === "/api/settings" && req.method === "POST") { writeFileSync(join(dirs.config, `${user}.json`), JSON.stringify(await body(req), null, 2)); return send(res, 200, { ok: true }); }
    if (url.pathname === "/api/worlds" && req.method === "GET") return send(res, 200, readJson(join(dirs.worlds, `${user}.json`), { worlds: [] }));
    if (url.pathname === "/api/worlds" && req.method === "POST") { writeFileSync(join(dirs.worlds, `${user}.json`), JSON.stringify(await body(req), null, 2)); return send(res, 200, { ok: true }); }
    const world = safe(url.searchParams.get("world"));
    const savePath = join(dirs.worlds, `${user}_${world}.json`);
    if (url.pathname === "/api/world-save" && req.method === "GET") return send(res, 200, readJson(savePath, null));
    if (url.pathname === "/api/world-save" && req.method === "POST") { writeFileSync(savePath, JSON.stringify(await body(req), null, 2)); return send(res, 200, { ok: true }); }
    if (url.pathname === "/api/world-save" && req.method === "DELETE") { if (existsSync(savePath)) unlinkSync(savePath); return send(res, 200, { ok: true }); }
    if (url.pathname === "/api/account" && req.method === "POST") { const data = await body(req); const name = safe(data.username); const path = accountPath(name); const existing = readJson(path, null); if (data.action === "register") { if (existing) return send(res, 409, { ok: false, error: "exists" }); const salt = randomBytes(16).toString("hex"); writeFileSync(path, JSON.stringify({ username: name, password_hash: passwordHash(data.password || "", salt), salt }, null, 2)); return send(res, 200, { ok: true }); } if (!existing || passwordHash(data.password || "", existing.salt) !== existing.password_hash) return send(res, 401, { ok: false }); return send(res, 200, { ok: true, username: name }); }
    return send(res, 404, { error: "Not found" });
  } catch (error) { return send(res, 500, { error: String(error) }); }
};

const vite = await createViteServer({ root, server: { middlewareMode: true } });
const server = createServer(async (req, res) => {
  const handled = await api(req, res);
  if (!handled && !res.writableEnded) vite.middlewares(req, res);
});
const port = Number(process.env.PORT || 5173);
server.listen(port, "127.0.0.1", () => console.log(`My2DWorld running at http://127.0.0.1:${port}`));
