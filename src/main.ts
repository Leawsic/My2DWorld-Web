import "./style.css";
import {type KeyState, Player} from "./core/player";
import {MobManager, MOB_KINDS, MOB_RENDER_RADIUS, type Mob, type MobKind} from "./core/entity";
import {storage, type PluginPackage} from "./core/storage";
import {biomeAt, DEFAULT_BIOME, hashSeed, spawnX, World, WORLD_MIN_Y, WORLD_MAX_Y, type Biome} from "./core/world";
import {clampSpectateOffset} from "./core/spectate";
import {ParticleSystem} from "./core/particles";
import {characterParticleTexture, preloadCharacterAnimations, reloadCharacterAnimations, reloadCharacterImages, renderCharacter} from "./core/skeleton";
import {loadHitboxes} from "./core/hitboxes";
import {
    DEFAULT_SETTINGS,
    type GameModeName,
    type KeyBindings,
    type Language,
    type PlayerSettings,
    type WorldMeta,
    type WorldSave
} from "./core/types";
import {createMode} from "./modes";
import type {GameMode, ModeContext} from "./modes/base";
import {CreativeMode} from "./modes/creative";
import {type GamePlugin, type PluginGameContext, PluginRegistry} from "./plugins/api";
import {keyName, t} from "./i18n";
import {Blocks, GameModes, blockRegistry} from "./registry";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

const LOCATE_RANGE = 20000;
const LOCATABLE_BIOMES = ["plains", "forest", "desert", "snowy", "mountains", "ocean", "river"];
const STRUCTURE_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
/** 玩家被实体挤压后的 1s 无敌帧（期间不再受挤压伤害，击退仍生效）。 */
const PLAYER_SQUEEZE_IFRAME = 1;
/** 亡灵生物挤压玩家附带的缓慢时长（秒）。 */
const UNDEAD_SLOW_SECONDS = 5;

/** 命令补全与语法高亮共用的命令表。 */
const CHAT_COMMANDS = ["gamemode", "speed", "movespeed", "debug", "seed", "locate", "tp", "summon", "structure", "reload", "aggro"];
const CHAT_ARG_SUGGESTIONS: Record<string, string[]> = {
    gamemode: ["creative", "spectator"],
    debug: ["on", "off", "true", "false"],
    locate: LOCATABLE_BIOMES,
    summon: Object.keys(MOB_KINDS),
    structure: ["export", "load", "list", "delete"],
    reload: ["images", "animations", "hitboxes", "plugins", "all"],
};

/** 补全命令后自动补一个空格（还有后续参数）。 */
const COMMANDS_WITH_ARGS = ["/gamemode", "/debug", "/locate", "/tp", "/summon", "/reload", "/structure", "/aggro"];

/** Region placed by the two-phase /structure export|load flow before confirm. */
interface StructurePending {
    mode: "export" | "load";
    name: string;
    x0: number;
    y0: number;
    width: number;
    height: number;
    /** Cell content, present for load previews so overlaps can be shown. */
    blocks?: Record<string, string>;
}

let settings: PlayerSettings = DEFAULT_SETTINGS;
let language: Language = settings.language;
let username = "steve";
const plugins = new PluginRegistry();

interface PluginLoadReport {
    source: string;
    package?: PluginPackage;
    plugin?: GamePlugin;
    error?: string;
    blocks: string[];
    pending?: boolean;
}

const pluginReports: PluginLoadReport[] = [];

async function refreshPluginReports(): Promise<number> {
    const knownSources = new Set(pluginReports.map((report) => report.source));
    const discovered = (await storage.listPlugins()).filter((plugin) => !knownSources.has(plugin.entry));
    discovered.forEach((plugin) => pluginReports.push({
        source: plugin.entry,
        package: plugin,
        blocks: [],
        pending: true
    }));
    return discovered.length;
}

async function loadExternalPlugins(bust = false): Promise<void> {
    for (const packageInfo of await storage.listPlugins()) {
        try {
            const specifier = bust ? `${packageInfo.entry}?t=${Date.now()}` : packageInfo.entry;
            const module = await import(/* @vite-ignore */ specifier) as {
                default?: GamePlugin;
                plugin?: GamePlugin
            };
            const plugin = module.default || module.plugin;
            if (!plugin) throw new Error("Module must export default or plugin");
            if (plugin.id !== packageInfo.id) throw new Error(`Manifest id ${packageInfo.id} does not match exported plugin id ${plugin.id}`);
            const previousBlocks = new Set(plugins.blocks.keys());
            plugins.use(plugin);
            pluginReports.push({
                source: packageInfo.entry,
                package: packageInfo,
                plugin,
                blocks: [...plugins.blocks.keys()].filter((id) => !previousBlocks.has(id))
            });
            storage.log("Plugin loaded", {id: plugin.id, version: plugin.version || "unspecified"});
        } catch (error) {
            pluginReports.push({source: packageInfo.entry, package: packageInfo, error: String(error), blocks: []});
            console.error(`Failed to load plugin ${packageInfo.id}`, error);
            storage.log("Plugin load failed", {plugin: packageInfo.id, error: String(error)}, "error");
        }
    }
}

// Coordinates are source pixels in tab_inventory.png (512 x 512). Adjust these
// values to fine-tune the imported GUI artwork without changing interaction code.
const CREATIVE_INVENTORY_GUI = {
    panelOffsetX: 80,
    panelOffsetY: 100,
    gridOffsetX: 16,
    gridOffsetY: 106,
    slotSize: 36,
    hotbarOffsetX: 16,
    hotbarOffsetY: 222,
    heldItemOffsetX: 0,
    heldItemOffsetY: 0,
} as const;

function toggleLanguage(): void {
    language = language === "zh" ? "en" : "zh";
    settings.language = language;
    storage.saveSettings(settings);
    document.title = t(language, "window_title");
}

const text = (zh: string, en: string) => language === "zh" ? zh : en;
const AUTOSAVE_OPTIONS = [0, 60, 300, 600];

/** Scale an "#rrggbb" colour by a brightness factor. */
function shadeColor(hex: string, factor: number): string {
    const n = Number.parseInt(hex.slice(1), 16);
    if (!Number.isFinite(n) || hex.length !== 7) return hex;
    const r = Math.round(Math.min(255, ((n >> 16) & 255) * factor));
    const g = Math.round(Math.min(255, ((n >> 8) & 255) * factor));
    const b = Math.round(Math.min(255, (n & 255) * factor));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function autosaveLabel(seconds: number): string {
    if (seconds <= 0) return text("关闭", "Off");
    return seconds < 60 ? `${seconds} ${text("秒", "sec")}` : `${Math.round(seconds / 60)} ${text("分钟", "min")}`;
}

function nextAutosave(seconds: number): number {
    return AUTOSAVE_OPTIONS[(AUTOSAVE_OPTIONS.indexOf(seconds) + 1) % AUTOSAVE_OPTIONS.length];
}

const ALPHA_PRESETS = [0.3, 0.5, 0.7, 1];
const BRIGHTNESS_PRESETS = [0.5, 0.75, 1];
const CHAT_FONT_PRESETS = [12, 13, 14, 16, 18, 20, 24];

function nextPreset(value: number, presets: number[]): number {
    const index = presets.indexOf(value);
    return presets[(index < 0 ? 0 : index + 1) % presets.length];
}

const shell = (content: string) => {
    app.innerHTML = `<div class="shell">${content}</div>`;
};
const button = (label: string, action: string, className = "") => `<button class="button ${className}" data-action="${action}">${label}</button>`;

/** 主界面背景：从 /assets/Homepage_background 中随机选一张。 */
let homepageBackground = "/assets/Homepage_background/1.jpg";

async function loadHomepageBackground(): Promise<void> {
    try {
        const res = await fetch("/api/homepage-backgrounds");
        if (!res.ok) return;
        const data = (await res.json()) as {backgrounds?: string[]};
        const list = (data.backgrounds || []).filter((file) => /\.(jpe?g|png|webp)$/i.test(file));
        if (list.length) homepageBackground = `/assets/Homepage_background/${list[Math.floor(Math.random() * list.length)]}`;
    } catch {
        // 接口不可用时保持默认背景
    }
}

function renderLogin(message = ""): void {
    shell(`<section class="login-screen" style="background-image: linear-gradient(100deg, rgba(10, 21, 27, .18), #10232c 80%), url('${homepageBackground}')"><div class="brand"><span>MY2D</span><strong>WORLD</strong><small>an endless block journal</small></div><div class="login-panel"><div class="eyebrow">LOCAL SESSION / 01</div><h1>${text("进入世界", "Enter your world")}</h1><p>${text("在浏览器中继续你的无限地形旅程。", "Continue your infinite terrain journey in the browser.")}</p><input id="username" placeholder="${text("账号", "Username")}" /><input id="password" type="password" placeholder="${text("密码", "Password")}" /><div class="actions">${button(text("登录", "Login"), "login", "primary")}${button(text("注册", "Register"), "register")}</div><div class="login-tools"><button data-action="language">${language === "zh" ? "中文" : "English"}</button><button data-action="demo">${text("使用默认账号", "Use demo account")}</button></div><div class="message">${message}</div></div></section>`);
}

async function renderWorlds(message = ""): Promise<void> {
    const worlds = await storage.loadWorlds(username);
    const rows = worlds.map((world) => `<div class="world-row"><div><b>${world.name}</b><span>${world.mode === "creative" ? text("创造模式", "Creative") : text("旁观模式", "Spectator")} · ${text("种子", "Seed")} ${world.seed ?? 0}</span></div>${button(text("进入", "Enter"), `enter:${world.id}`, "primary")}${button(text("删除", "Delete"), `delete:${world.id}`, "small")}</div>`).join("");
    shell(`<section class="world-screen"><header class="topbar"><div class="brand compact"><span>MY2D</span><strong>WORLD</strong></div><div class="top-actions"><span>${username}</span><button data-action="plugins">${text("插件", "Plugins")} · ${pluginReports.length}</button><button data-action="language">${language === "zh" ? "中" : "EN"}</button>${button(text("退出", "Log out"), "logout")}</div></header><div class="world-content"><div class="section-kicker">WORLD ARCHIVE / ${String(worlds.length).padStart(2, "0")}</div><h1>${text("我的世界", "My worlds")}</h1><p class="muted">${text("选择一个存档，或者从一片新的地平线开始。", "Choose a save, or start from a new horizon.")}</p><div class="world-list">${rows || `<div class="empty">${text("还没有世界。创建第一个世界。", "No worlds yet. Create your first one.")}</div>`}</div></div><div class="world-actions">${button(text("插件管理", "Plugin Manager"), "plugins")}${button(text("创建世界", "Create world"), "create-world", "primary create")}</div><div class="message">${message}</div></div></section>`);
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        "\"": "&quot;"
    })[character]!);
}

function renderPlugins(message = ""): void {
    const loaded = pluginReports.filter((report) => report.plugin).length;
    const failed = pluginReports.filter((report) => report.error).length;
    const cards = pluginReports.map((report) => {
        const plugin = report.plugin;
        const state = plugin ? text("已加载", "Loaded") : report.pending ? text("等待重新加载", "Reload required") : text("加载失败", "Failed");
        const metadata = plugin
            ? `<div class="plugin-metadata"><span>ID <b>${escapeHtml(plugin.id)}</b></span><span>${text("版本", "Version")} <b>${escapeHtml(plugin.version || "-")}</b></span><span>${text("作者", "Authors")} <b>${escapeHtml(plugin.authors?.join(", ") || "-")}</b></span><span>${text("注册方块", "Registered blocks")} <b>${escapeHtml(report.blocks.join(", ") || text("无", "None"))}</b></span></div><p>${escapeHtml(plugin.description || text("未提供描述。", "No description provided."))}</p>${plugin.website ? `<a href="${escapeHtml(plugin.website)}" target="_blank" rel="noreferrer">${escapeHtml(plugin.website)}</a>` : ""}`
            : `<p class="plugin-error">${escapeHtml(report.error || text("插件已发现，重新加载页面后会安装。", "Plugin discovered. Reload the page to install it."))}</p>`;
        return `<article class="plugin-card ${plugin ? "loaded" : report.pending ? "pending" : "failed"}"><div class="plugin-card-head"><div><span class="plugin-state">${state}</span><h2>${escapeHtml(plugin?.name || report.source.split("/").at(-1) || "plugin")}</h2></div><code>${escapeHtml(report.source.split("/").at(-1) || report.source)}</code></div>${metadata}</article>`;
    }).join("");
    shell(`<section class="plugin-screen"><header class="topbar"><div class="brand compact"><span>MY2D</span><strong>WORLD</strong></div><div class="top-actions"><button data-action="worlds">${text("返回世界", "Back to Worlds")}</button></div></header><main class="plugin-content"><div class="section-kicker">EXTENSION CONSOLE / ${String(pluginReports.length).padStart(2, "0")}</div><div class="plugin-heading"><div><h1>${text("插件管理", "Plugin Manager")}</h1><p class="muted">${text("新增或修改插件后，先扫描文件，再重新加载页面完成安装。", "After adding or changing a plugin, scan files and reload the page to install it.")}</p></div><div class="plugin-summary"><b>${loaded}</b><span>${text("已加载", "loaded")}</span><b>${failed}</b><span>${text("失败", "failed")}</span></div></div><div class="plugin-actions">${button(text("扫描插件文件", "Scan plugin files"), "plugins-rescan")}${button(text("重新加载页面", "Reload page"), "plugins-reload", "primary")}${button(text("返回世界", "Back to Worlds"), "worlds")}</div><div class="plugin-list">${cards || `<div class="empty">${text("plugins 文件夹中尚未发现 .mjs 插件。", "No .mjs plugins were found in the plugins directory.")}</div>`}</div><div class="message">${message}</div></main></section>`);
}

function renderCreate(): void {
    const defaults = settings.movement;
    shell(`<section class="create-screen"><div class="create-card"><div class="section-kicker">NEW TERRITORY / 00${Math.floor(Math.random() * 9)}</div><h1>${text("创建世界", "Create world")}</h1><label>${text("世界名称", "World name")}<input id="world-name" value="新世界" maxlength="24" /></label><label>${text("游戏模式", "Game mode")}<select id="world-mode"><option value="spectator">${text("旁观模式", "Spectator")}</option><option value="creative">${text("创造模式", "Creative")}</option></select></label><label>${text("世界种子", "World seed")}<input id="world-seed" placeholder="${text("留空自动生成", "Blank to random")}" /></label><div class="physics-grid"><label>${text("行走速度", "Walk speed")}<input id="walk-speed" type="number" step="0.1" value="${defaults.walkSpeed}" /></label><label>${text("飞行速度", "Fly speed")}<input id="fly-speed" type="number" step="0.1" value="${defaults.flySpeed}" /></label><label>${text("跳跃力度", "Jump power")}<input id="jump-velocity" type="number" step="0.1" value="${defaults.jumpVelocity}" /></label><label>${text("重力", "Gravity")}<input id="gravity" type="number" step="0.1" value="${defaults.gravity}" /></label></div><div class="actions">${button(text("开始探索", "Start exploring"), "save-world", "primary")}${button(text("取消", "Cancel"), "worlds")}</div></div></section>`);
}

class GameSession {
    readonly canvas = document.createElement("canvas");
    readonly ctx = this.canvas.getContext("2d")!;
    readonly world: World;
    readonly player: Player;
    mode: GameMode;
    modeName: GameModeName;
    blockSize = 32;
    paused = false;
    debug = settings.debugDefault;
    showHitboxes = false;
    private keys: KeyState = {left: false, right: false, up: false, down: false, jump: false, sneak: false};
    private mouseDown = false;
    private last = performance.now();
    private frame = 0;
    private autosaveElapsed = 0;
    private hotbar: Array<string | null> = [Blocks.MY2DWORLD.GRASS_BLOCK, Blocks.MY2DWORLD.DIRT, Blocks.MY2DWORLD.STONE, Blocks.MY2DWORLD.OAK_LOG, Blocks.MY2DWORLD.OAK_LEAVES, Blocks.MY2DWORLD.SHORT_GRASS, Blocks.MY2DWORLD.POPPY, Blocks.MY2DWORLD.SAND, Blocks.MY2DWORLD.SNOW].map((block) => block.id);
    private inventorySlots: Array<string | null> = [Blocks.MY2DWORLD.DIAMOND_BLOCK, Blocks.MY2DWORLD.COAL_ORE, Blocks.MY2DWORLD.IRON_ORE, Blocks.MY2DWORLD.GOLD_ORE, Blocks.MY2DWORLD.DIAMOND_ORE, Blocks.MY2DWORLD.EMERALD_ORE, Blocks.MY2DWORLD.LAPIS_ORE, Blocks.MY2DWORLD.REDSTONE_ORE, Blocks.MY2DWORLD.COPPER_ORE, Blocks.MY2DWORLD.BEDROCK, Blocks.MY2DWORLD.DEEPSLATE, Blocks.MY2DWORLD.DEEPSLATE_COAL_ORE, Blocks.MY2DWORLD.DEEPSLATE_IRON_ORE, Blocks.MY2DWORLD.DEEPSLATE_GOLD_ORE, Blocks.MY2DWORLD.DEEPSLATE_DIAMOND_ORE, Blocks.MY2DWORLD.DEEPSLATE_EMERALD_ORE, Blocks.MY2DWORLD.DEEPSLATE_LAPIS_ORE, Blocks.MY2DWORLD.DEEPSLATE_REDSTONE_ORE, Blocks.MY2DWORLD.DEEPSLATE_COPPER_ORE, Blocks.MY2DWORLD.RAW_IRON_BLOCK, Blocks.MY2DWORLD.RAW_GOLD_BLOCK, Blocks.MY2DWORLD.NETHER_QUARTZ_ORE, Blocks.MY2DWORLD.NETHER_GOLD_ORE, Blocks.MY2DWORLD.IRON_BARS, Blocks.MY2DWORLD.IRON_CHAIN, Blocks.MY2DWORLD.MOSSY_COBBLESTONE, Blocks.MY2DWORLD.DANDELION, Blocks.MY2DWORLD.CACTUS].map((block) => block.id);
    private selected = 0;
    private health = 20;
    private voidDamageTimer = 0;
    private squeezeTimer = 0;
    /** 玩家被实体挤压后的 1s 无敌帧（期间不再受挤压伤害，击退仍生效）。 */
    private squeezeIframe = 0;
    private notice = "";
    private noticeTimer = 0;
    private menu: "pause" | "settings" | "bindings" | "display" | "plugins" | null = null;
    private inventoryOpen = false;
    private heldInventoryItem: string | null = null;
    private bindingCapture: keyof KeyBindings | null = null;
    private readonly blockImages = new Map<string, HTMLImageElement | HTMLCanvasElement>();
    private readonly biomeImages = new Map<string, HTMLCanvasElement>();
    private readonly guiImages = new Map<string, HTMLImageElement>();
    private readonly mobs: MobManager;
    private readonly fx = new ParticleSystem();
    private readonly inventoryBackground = this.loadImage("/assets/gui/creative_inventory/tab_inventory.png");
    private placement: [number, number] | null = null;
    private active = true;
    private cameraOffsetX = 0;
    private cameraOffsetY = 0;
    private dragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragOriginX = 0;
    private dragOriginY = 0;
    private dragOriginPlayerX = 0;
    private dragOriginPlayerY = 0;
    private spectate = false;
    private lastFlying = false;
    private f3Held = false;
    private f4Held = false;
    private modeComboPending = false;
    private modeComboConsumed = false;
    private structurePending: StructurePending | null = null;

    constructor(readonly meta: WorldMeta, private readonly initialSave: WorldSave | null) {
        this.modeName = meta.mode;
        this.world = new World(8, meta.seed ?? 0);
        this.mobs = new MobManager(meta.seed ?? 0);
        this.mobs.aggroRange = settings.aggroRange;
        const x = this.initialSave?.playerX ?? spawnX(meta.seed ?? 0);
        const y = this.initialSave?.playerY ?? this.world.getSurfaceHeight(x) + 0.001;
        this.world.updateView(x);
        this.world.restore(this.initialSave);
        plugins.notifyWorldCreated(this.world);
        this.player = new Player(x, y, meta.physics);
        if (this.initialSave?.mode) this.modeName = this.initialSave.mode;
        this.mode = createMode(this.modeName);
        [...new Set([...blockRegistry.list().map((block) => block.id), ...plugins.blocks.keys()].filter((type): type is string => type !== null))].forEach((type) => this.loadBlock(type));
        this.loadGui("mode_creative", "/assets/gui/gamemode/creative.png");
        this.loadGui("mode_spectator", "/assets/gui/gamemode/spectator.png");
        this.loadGui("mouse", "/assets/gui/mouse/mouse.png");
        this.loadGui("mouse_attack", "/assets/gui/mouse/attack.png");
        this.loadGui("mouse_left_broke", "/assets/gui/mouse/mouse_left_broke.png");
        this.loadGui("mouse_right_place_and_move", "/assets/gui/mouse/mouse_right_place_and_move.png");
        this.loadGui("move_fly", "/assets/gui/movemode/creative_fly.png");
        this.loadGui("move_walk", "/assets/gui/movemode/creative_walk.png");
        this.canvas.className = "game-canvas";
        this.ctx.imageSmoothingEnabled = false;
        document.body.innerHTML = "";
        document.body.appendChild(this.canvas);
        this.ensureChatInput();
        this.bindInput();
        this.resize();
        window.addEventListener("resize", this.resize);
        window.addEventListener("beforeunload", () => this.stop("browser-unload"));
        plugins.setMessageTarget({chat: this.sendPluginChat, title: this.sendPluginTitle});
        plugins.notifyGameStart(this.pluginContext());
        storage.log("Game started", {world: meta.name, worldId: meta.id, mode: this.modeName});
        void this.preloadAnimations();
        // 碰撞箱是异步加载的：加载完成后刷新所有已生成的生物，
        // 否则先出生（或已在第一帧生成）的生物会用内置默认碰撞箱显示/碰撞（reload 前错误）。
        void loadHitboxes().then(() => this.mobs.refreshHitboxes());
        requestAnimationFrame(this.tick);
    }

    /** 从 public/animations 加载字符动画文件（缺失时渲染回退到内置骨架）。 */
    private async preloadAnimations(): Promise<void> {
        try {
            const res = await fetch("/api/animations");
            if (!res.ok) return;
            const data = (await res.json()) as {animations?: string[]};
            await preloadCharacterAnimations(data.animations ?? []);
        } catch (error) {
            console.warn("Animation preload failed", error);
        }
    }

    private resize = (): void => {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx.imageSmoothingEnabled = false;
        if (this.chatOpen) this.positionChatInput();
    };

    private bindInput(): void {
        const actionFor = (code: string): keyof KeyBindings | null => (Object.entries(settings.keyBindings).find(([, value]) => value === code)?.[0] as keyof KeyBindings | undefined) || null;
        const isMove = (action: keyof KeyBindings | null): action is "left" | "right" | "up" | "down" | "jump" => !!action && ["left", "right", "up", "down", "jump"].includes(action);
        window.addEventListener("keydown", (event) => {
            if (this.bindingCapture) {
                settings.keyBindings[this.bindingCapture] = event.code;
                this.bindingCapture = null;
                storage.saveSettings(settings);
                event.preventDefault();
                return;
            }
            if (this.chatOpen) {
                this.handleChatKey(event);
                return;
            }
            if (event.code === "KeyE" && this.modeName === GameModes.CREATIVE.id) {
                this.toggleInventory();
                event.preventDefault();
                return;
            }
            if (this.inventoryOpen) {
                if (event.key === "Escape") this.toggleInventory();
                event.preventDefault();
                return;
            }
            const action = actionFor(event.code);
            if (event.key === "Escape") {
                this.menu = this.menu ? null : "pause";
                this.paused = Boolean(this.menu);
                if (this.paused) {
                    plugins.notifyGamePause(this.pluginContext());
                    storage.log("Game paused", {world: this.meta.name});
                } else {
                    plugins.notifyGameResume(this.pluginContext());
                    storage.log("Game resumed", {world: this.meta.name});
                }
            }
            if (event.key === "F7") event.preventDefault();
            if (event.key === "F11") event.preventDefault();
            if (event.code === settings.keyBindings.hitbox || event.code === settings.keyBindings.debug || event.code === settings.keyBindings.mode) event.preventDefault();
            if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
                this.keys.sneak = true;
                event.preventDefault();
            }
            if (action === "debug") {
                if (!this.f3Held) this.modeComboConsumed = false;
                this.f3Held = true;
            }
            if (action === "mode") this.f4Held = true;
            if (isMove(action)) {
                this.keys[action] = true;
                event.preventDefault();
            }
        });
        window.addEventListener("keyup", (event) => {
            const action = actionFor(event.code);
            const isShift = event.code === "ShiftLeft" || event.code === "ShiftRight";
            if (isMove(action)) this.keys[action] = false;
            if (isShift) this.keys.sneak = false;
            if (isMove(action)) return;
            if (action === "hitbox") {
                this.showHitboxes = !this.showHitboxes;
                this.notice = this.showHitboxes ? text("碰撞箱/范围 开", "Hitboxes ON") : text("碰撞箱/范围 关", "Hitboxes OFF");
                this.noticeTimer = 1.2;
            }
            if (this.chatOpen || this.inventoryOpen) {
                if (action === "debug") this.f3Held = false;
                if (action === "mode") this.f4Held = false;
                return;
            }
            if (action === "debug") {
                this.f3Held = false;
                if (this.f4Held) this.modeComboPending = true;
                else if (this.modeComboConsumed) this.modeComboConsumed = false;
                else this.debug = !this.debug;
            }
            if (action === "mode") {
                this.f4Held = false;
                if (this.f3Held || this.modeComboPending) {
                    this.modeComboPending = false;
                    this.modeComboConsumed = true;
                    this.toggleMode();
                }
            }
            if (event.key === "F7") this.toggleSpectate();
            if (event.key === "F11") {
                event.preventDefault();
                if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen();
            }
            if (event.key === "=" || event.key === "+") this.blockSize = Math.min(72, this.blockSize * 1.15);
            if (event.key === "-") this.blockSize = Math.max(16, this.blockSize / 1.15);
            if (/^Digit[1-9]$/.test(event.code)) this.selected = Math.min(this.hotbar.length - 1, Number(event.code.at(-1)) - 1);
            if (action === "chat") this.openChat();
            if (event.key === "/") this.openChat("/");
        });
        window.addEventListener("blur", () => {
            this.keys = {left: false, right: false, up: false, down: false, jump: false, sneak: false};
            this.f3Held = false;
            this.f4Held = false;
            this.modeComboPending = false;
            this.modeComboConsumed = false;
        });
        this.canvas.addEventListener("mousemove", (event) => {
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = event.clientX - rect.left;
            this.lastMouseY = event.clientY - rect.top;
        });
        this.canvas.addEventListener("mousedown", (event) => {
            if (this.chatOpen || this.inventoryOpen) {
                if (this.chatOpen && event.button === 0) this.handleSuggestionClick(event.clientX, event.clientY);
                if (this.inventoryOpen && event.button === 0) this.handleInventoryClick(event.clientX, event.clientY);
                event.preventDefault();
                return;
            }
            if (this.menu) {
                if (event.button === 0) this.handleMenuClick(event.clientX, event.clientY);
                return;
            }
            if (event.button === 0) {
                const slot = this.hotbarSlotAt(event.clientX, event.clientY);
                if (slot >= 0) this.selected = slot; else this.mouseDown = true;
            }
            if (event.button === 2) {
                if (this.modeName === "spectator" || this.spectate) {
                    this.dragging = true;
                    this.dragStartX = event.clientX;
                    this.dragStartY = event.clientY;
                    this.dragOriginX = this.cameraOffsetX;
                    this.dragOriginY = this.cameraOffsetY;
                    this.dragOriginPlayerX = this.player.x;
                    this.dragOriginPlayerY = this.player.y;
                } else this.place(event.clientX, event.clientY);
            }
        });
        this.canvas.addEventListener("mousemove", (event) => {
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = event.clientX - rect.left;
            this.lastMouseY = event.clientY - rect.top;
            if (this.dragging) {
                const dx = -(event.clientX - this.dragStartX) / this.blockSize;
                const dy = (event.clientY - this.dragStartY) / this.blockSize;
                if (this.modeName === "spectator") {
                    this.player.x = this.dragOriginPlayerX + dx;
                    this.player.y = this.dragOriginPlayerY + dy;
                } else if (this.spectate) {
                    [this.cameraOffsetX, this.cameraOffsetY] = clampSpectateOffset(this.dragOriginX + dx, this.dragOriginY + dy);
                }
            }
        });
        window.addEventListener("mouseup", () => {
            this.mouseDown = false;
            this.dragging = false;
        });
        this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
        this.canvas.addEventListener("wheel", (event) => {
            event.preventDefault();
            if (this.chatOpen) {
                this.chatScroll = Math.max(0, Math.min(Math.max(0, this.chatLineCount() - 9), this.chatScroll + Math.sign(event.deltaY)));
            } else if (!this.inventoryOpen && this.hotbarSlotAt(event.clientX, event.clientY) >= 0) this.selected = (this.selected + Math.sign(event.deltaY) + this.hotbar.length) % this.hotbar.length; else if (!this.inventoryOpen) this.blockSize = this.snapBlockSize(this.blockSize * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
        }, {passive: false});
    }

    private toggleMode(): void {
        if (this.menu || this.inventoryOpen) return;
        const previousMode = this.modeName;
        this.modeName = this.modeName === "creative" ? "spectator" : "creative";
        this.mode = createMode(this.modeName);
        this.cameraOffsetX = 0;
        this.cameraOffsetY = 0;
        this.dragging = false;
        this.spectate = false;
        this.notice = text("已切换游戏模式", "Game mode switched");
        this.noticeTimer = 2;
        this.save();
        plugins.notifyGameModeChanged({...this.pluginContext(), previousMode, mode: this.modeName});
        storage.log("Game mode changed", {world: this.meta.name, from: previousMode, to: this.modeName});
    }

    private toggleSpectate(): void {
        if (this.menu || this.inventoryOpen || this.modeName !== "creative") return;
        this.spectate = !this.spectate;
        this.cameraOffsetX = 0;
        this.cameraOffsetY = 0;
        this.dragging = false;
        this.notice = this.spectate ? text("灵魂出窍", "Out of body") : text("已返回身体", "Back to body");
        this.noticeTimer = 2;
        plugins.notifySpectateChanged({...this.pluginContext(), spectate: this.spectate});
    }

    private worldAtMouse(): [number, number] {
        const rect = this.canvas.getBoundingClientRect();
        return [this.player.x + this.cameraOffsetX + (this.lastMouseX - rect.width / 2) / this.blockSize, this.player.y + this.cameraOffsetY - (this.lastMouseY - rect.height / 2) / this.blockSize];
    }

    private inReach(worldX: number, worldY: number): boolean {
        const centerX = this.player.x;
        const centerY = this.player.y + 0.95;
        return Math.abs(worldX - centerX) <= 2.5 && Math.abs(worldY - centerY) <= 3;
    }

    private hovered(): [number, number, string] | null {
        const [x, y] = this.worldAtMouse();
        const wx = Math.floor(x);
        const wy = Math.ceil(y);
        const block = this.world.getBlock(wx, wy);
        return block && this.inReach(wx + 0.5, wy - 0.5) ? [wx, wy, block.id] : null;
    }

    /** Block under the cursor regardless of reach; used for the white frame and top-center info. */
    private pointedBlock(): [number, number, string] | null {
        const [x, y] = this.worldAtMouse();
        const wx = Math.floor(x);
        const wy = Math.ceil(y);
        const block = this.world.getBlock(wx, wy);
        return block ? [wx, wy, block.id] : null;
    }

    private blockName(id: string): string {
        return blockRegistry.get(id)?.label?.[language] ?? id;
    }

    private getPlacementTarget(): [number, number] | null {
        if (this.modeName !== "creative") return null;
        const [x, y] = this.worldAtMouse();
        const cellX = Math.floor(x);
        const cellY = Math.ceil(y);
        if (cellY < WORLD_MIN_Y || cellY > WORLD_MAX_Y) return null;
        let target: [number, number];
        const hit = this.world.getBlock(cellX, cellY);
        if (!hit || !hit.solid) {
            target = [cellX, cellY];
        } else {
            const relX = x - (cellX + 0.5);
            const relY = y - (cellY - 0.5);
            target = Math.abs(relX) > Math.abs(relY) ? [cellX + (relX >= 0 ? 1 : -1), cellY] : [cellX, cellY + (relY >= 0 ? 1 : -1)];
        }
        if (target[1] < WORLD_MIN_Y || target[1] > WORLD_MAX_Y) return null;
        if (this.world.isSolid(target[0], target[1])) return null;
        if (this.mobs.occupies(target[0], target[1])) return null;
        if (!this.inReach(target[0] + 0.5, target[1] - 0.5)) return null;
        const left = this.player.x - 0.25;
        const right = this.player.x + 0.25;
        const playerBottom = this.player.y;
        const playerTop = playerBottom + 1.9;
        if (left < target[0] + 1 && right > target[0] && playerBottom < target[1] && playerTop > target[1] - 1) return null;
        return target;
    }

    private lastMouseX = 0;
    private lastMouseY = 0;
    private chatOpen = false;
    private chatText = "";
    private chatMessages: Array<{ text: string; color: string; age: number }> = [];
    private chatHistory: string[] = [];
    private chatHistoryCursor: number | null = null;
    private chatScroll = 0;
    private suggestionIndex = 0;
    private suggestions: string[] = [];
    /** DOM 聊天框：透明文字的 textarea 覆盖在语法高亮层上，支持原生选中/复制/粘贴/输入法。 */
    private chatBox: HTMLDivElement | null = null;
    private chatSyntax: HTMLDivElement | null = null;
    private chatInput: HTMLTextAreaElement | null = null;
    /** 输入框当前高度（长命令自动换行后随之增高），canvas 画背景时使用。 */
    private chatInputHeight = 34;
    /** 本次渲染算出的建议块点击区域，供鼠标悬停高亮与点击补全。 */
    private suggestionHitAreas: Array<{x: number; y: number; w: number; h: number; suggestion: string}> = [];

    private ensureChatInput(): void {
        if (this.chatBox && this.chatBox.isConnected) return;
        if (this.chatBox) this.chatBox.remove();
        const box = document.createElement("div");
        box.className = "chat-box";
        const syntax = document.createElement("div");
        syntax.className = "chat-syntax";
        const input = document.createElement("textarea");
        input.className = "chat-input";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.wrap = "soft";
        input.rows = 1;
        input.addEventListener("input", () => {
            if (input.value.length > 160) input.value = input.value.slice(0, 160);
            this.chatText = input.value;
            this.renderChatSyntax();
            this.updateChatInputSize();
            this.resetSuggestions();
        });
        box.appendChild(syntax);
        box.appendChild(input);
        document.body.appendChild(box);
        this.chatBox = box;
        this.chatSyntax = syntax;
        this.chatInput = input;
    }

    /** 输入框单行行高（line-height × 字号，不含上下内边距）。 */
    private chatLineHeight(fontSize = settings.chatFontSize): number {
        return Math.round(fontSize * 1.4);
    }

    /** 按当前字体宽度把文本折成多行（与 DOM textarea 的 soft-wrap 对齐）。 */
    private wrappedLineCount(text: string, fontSize: number, maxWidth: number): number {
        if (!text) return 1;
        const ctx = this.ctx;
        ctx.font = `${fontSize}px ui-monospace, 'LXGW WenKai', monospace`;
        let lines = 1;
        let width = 0;
        for (const ch of text) {
            const w = ctx.measureText(ch).width;
            if (width + w > maxWidth && width > 0) {
                lines += 1;
                width = w;
            } else width += w;
        }
        return lines;
    }

    /** 根据换行后的行数调整输入框高度并重新定位（长命令自动换行、聊天框随之增高）。 */
    private updateChatInputSize(): void {
        if (!this.chatBox || !this.chatInput) return;
        const fontSize = settings.chatFontSize;
        const maxWidth = window.innerWidth - 28 - 24;
        const lineH = this.chatLineHeight(fontSize);
        this.chatInput.style.fontSize = `${fontSize}px`;
        this.chatInput.style.lineHeight = `${lineH}px`;
        if (this.chatSyntax) {
            this.chatSyntax.style.fontSize = `${fontSize}px`;
            this.chatSyntax.style.lineHeight = `${lineH}px`;
        }
        // 以 DOM scrollHeight 兜底，保证实际 soft-wrap 行数不被裁剪
        this.chatInput.style.height = "auto";
        const contentH = Math.max(0, (this.chatInput.scrollHeight ?? 0) - 16);
        const domLines = Math.max(1, Math.ceil(contentH / lineH));
        const calcLines = this.wrappedLineCount(this.chatText, fontSize, maxWidth);
        const lines = Math.max(calcLines, domLines);
        this.chatInputHeight = lines * lineH + 16;
        this.chatInput.style.height = `${this.chatInputHeight}px`;
        this.chatBox.style.height = `${this.chatInputHeight}px`;
        this.chatBox.style.top = `${window.innerHeight - 12 - this.chatInputHeight}px`;
    }

    private positionChatInput(): void {
        if (!this.chatBox || !this.chatInput) return;
        this.chatBox.style.left = "14px";
        this.chatBox.style.width = `${window.innerWidth - 28}px`;
        this.updateChatInputSize();
    }

    private showChatInput(): void {
        if (!this.chatBox || !this.chatInput) return;
        this.chatText = this.chatText.slice(0, 160);
        this.chatInput.value = this.chatText;
        this.chatBox.style.display = "block";
        this.positionChatInput();
        this.renderChatSyntax();
        this.chatInput.focus();
        this.chatInput.setSelectionRange(this.chatText.length, this.chatText.length);
    }

    private hideChatInput(): void {
        if (!this.chatBox) return;
        this.chatBox.style.display = "none";
        this.chatInput?.blur();
    }

    /** 命令语法高亮：/命令=金色，已知子命令=绿色，数字=蓝色，其余=灰色。保留原始空白保证与输入对齐。 */
    private renderChatSyntax(): void {
        if (!this.chatSyntax) return;
        const text = this.chatText;
        if (!text.startsWith("/")) {
            this.chatSyntax.textContent = text;
            return;
        }
        const body = text.slice(1);
        const command = body.split(/\s+/)[0]?.toLowerCase() ?? "";
        const knownArgs = CHAT_ARG_SUGGESTIONS[command] || [];
        let html = `<span style="color:#e2bc68">/</span>`;
        const tokenRe = /(\S+)/g;
        let last = 0;
        let index = 0;
        for (const match of body.matchAll(tokenRe)) {
            const token = match[1];
            const start = match.index ?? 0;
            html += escapeHtml(body.slice(last, start));
            last = start + token.length;
            const lower = token.toLowerCase();
            let color = "#d2d9d5";
            if (index === 0) color = CHAT_COMMANDS.includes(lower) ? "#f5dc8e" : "#e2bc68";
            else if (/^-?\d+(\.\d+)?$/.test(token)) color = "#79c0ff";
            else if (knownArgs.includes(lower)) color = "#8de0a5";
            html += `<span style="color:${color}">${escapeHtml(token)}</span>`;
            index += 1;
        }
        html += escapeHtml(body.slice(last));
        this.chatSyntax.innerHTML = html;
    }

    /** 把 chatText 同步回 DOM 输入框并刷新语法高亮与输入框尺寸。 */
    private syncChatInput(): void {
        if (!this.chatInput) return;
        this.chatInput.value = this.chatText;
        this.renderChatSyntax();
        this.updateChatInputSize();
        this.chatInput.setSelectionRange(this.chatText.length, this.chatText.length);
    }

    /** 应用一条补全建议（Tab 循环与鼠标点击共用）。 */
    private applySuggestion(suggestion: string): void {
        if (suggestion.startsWith("/")) {
            this.chatText = suggestion + (COMMANDS_WITH_ARGS.includes(suggestion) ? " " : "");
            this.resetSuggestions();
        } else {
            const prefix = this.chatText.includes(" ") ? this.chatText.slice(0, this.chatText.lastIndexOf(" ")) : this.chatText;
            this.chatText = `${prefix} ${suggestion}`;
            // 含空格的建议（如 /tp 的 "x y" 坐标）无法通过「替换末段」循环，应用后清空候选
            if (suggestion.includes(" ")) this.resetSuggestions();
        }
        this.syncChatInput();
    }

    /** 鼠标点击命令提示块时补全命令。 */
    private handleSuggestionClick(clientX: number, clientY: number): void {
        for (const area of this.suggestionHitAreas) {
            if (clientX >= area.x && clientX <= area.x + area.w && clientY >= area.y && clientY <= area.y + area.h) {
                this.suggestionIndex = 0;
                this.applySuggestion(area.suggestion);
                return;
            }
        }
    }

    private openChat(initial = ""): void {
        this.chatOpen = true;
        this.chatText = initial;
        this.chatScroll = 0;
        this.suggestionIndex = 0;
        this.suggestions = [];
        this.chatHistoryCursor = null;
        this.paused = false;
        this.menu = null;
        this.showChatInput();
    }

    /**
     * Chat 输入处理：只拦截特殊键（Enter/Escape/Tab/历史/滚动），其余按键
     * 交给 DOM 输入框原生处理（因此支持选中、复制粘贴、中文输入法）。
     */
    private handleChatKey(event: KeyboardEvent): void {
        if (event.isComposing) return;
        if (event.key === "Escape") {
            this.chatOpen = false;
            this.chatText = "";
            this.chatScroll = 0;
            this.hideChatInput();
            event.preventDefault();
        } else if (event.key === "Enter") {
            const input = this.chatText.trim();
            if (input) {
                this.chatHistory.push(input);
                this.chatHistory = this.chatHistory.slice(-200);
                void this.submitChat(input);
            }
            this.chatOpen = false;
            this.chatText = "";
            this.chatHistoryCursor = null;
            this.hideChatInput();
            event.preventDefault();
        } else if (event.key === "Tab") {
            const suggestions = this.suggestions.length ? this.suggestions : this.getSuggestions();
            if (suggestions.length) {
                this.suggestions = suggestions;
                this.applySuggestion(suggestions[this.suggestionIndex % suggestions.length]);
                this.suggestionIndex += 1;
            }
            event.preventDefault();
        } else if (event.key === "ArrowUp") {
            if (this.chatHistory.length) {
                this.chatHistoryCursor = this.chatHistoryCursor === null ? this.chatHistory.length - 1 : Math.max(0, this.chatHistoryCursor - 1);
                this.chatText = this.chatHistory[this.chatHistoryCursor];
                this.resetSuggestions();
                this.syncChatInput();
            }
            event.preventDefault();
        } else if (event.key === "ArrowDown") {
            if (this.chatHistoryCursor !== null) {
                this.chatHistoryCursor += 1;
                if (this.chatHistoryCursor >= this.chatHistory.length) {
                    this.chatHistoryCursor = null;
                    this.chatText = "";
                } else this.chatText = this.chatHistory[this.chatHistoryCursor];
                this.resetSuggestions();
                this.syncChatInput();
            }
            event.preventDefault();
        } else if (event.key === "PageUp" || event.key === "PageDown") {
            const maxScroll = Math.max(0, this.chatLineCount() - 9);
            this.chatScroll = event.key === "PageUp" ? Math.max(0, this.chatScroll + 9) : Math.min(maxScroll, this.chatScroll - 9);
            event.preventDefault();
        }
        // 其余按键不拦截：交给原生输入（input 事件会把值同步回 chatText）。
    }

    private async submitChat(input: string): Promise<void> {
        this.addChat(`> ${input}`);
        if (!input.startsWith("/")) {
            this.addChat(input);
            return;
        }
        const parts = input.slice(1).trim().split(/\s+/);
        const command = parts[0]?.toLowerCase();
        if (command === "gamemode" && (parts[1] === "creative" || parts[1] === "spectator")) {
            const previousMode = this.modeName;
            this.modeName = parts[1];
            this.mode = createMode(this.modeName);
            this.cameraOffsetX = 0;
            this.cameraOffsetY = 0;
            this.dragging = false;
            this.spectate = false;
            this.save();
            plugins.notifyGameModeChanged({...this.pluginContext(), previousMode, mode: this.modeName});
            storage.log("Game mode changed", {world: this.meta.name, from: previousMode, to: this.modeName});
            this.addChat(`Gamemode set to ${this.modeName}`);
        } else if ((command === "speed" || command === "movespeed") && Number.isFinite(Number(parts[1]))) {
            const speed = Math.max(0.1, Math.min(50, Number(parts[1])));
            this.player.movement.walkSpeed = speed;
            this.meta.physics.walkSpeed = speed;
            settings.movement.walkSpeed = speed;
            storage.saveSettings(settings);
            const worlds = (await storage.loadWorlds(username)).map((world) => world.id === this.meta.id ? this.meta : world);
            await storage.saveWorlds(worlds, username);
            this.save();
            this.addChat(`Movement speed set to ${speed}`);
        } else if (command === "debug" && ["on", "off", "true", "false"].includes(parts[1])) {
            this.debug = parts[1] === "on" || parts[1] === "true";
            settings.debugDefault = this.debug;
            storage.saveSettings(settings);
            this.addChat(`Debug ${this.debug ? "on" : "off"}`);
        } else if (command === "aggro" && Number.isFinite(Number(parts[1]))) {
            const range = Math.max(1, Math.min(128, Math.round(Number(parts[1]))));
            this.mobs.aggroRange = range;
            settings.aggroRange = range;
            storage.saveSettings(settings);
            this.addChat(`Aggro range set to ${range}`);
        } else if (command === "seed") this.addChat(`Seed: ${this.meta.seed ?? 0}`);
        else if (command === "locate") {
            const target = (parts[1] ?? "").toLowerCase();
            if (!LOCATABLE_BIOMES.includes(target)) this.addChat(`Biomes: ${LOCATABLE_BIOMES.join(", ")}`);
            else {
                const location = this.locateBiome(target);
                if (location === null) this.addChat(`Could not locate ${target} within ${LOCATE_RANGE} blocks`);
                else {
                    const surface = Math.round(this.world.getSurfaceHeight(Math.floor(location)));
                    this.teleportTo(location);
                    this.addChat(`Located ${target} at x=${Math.floor(location)} y=${surface}, teleported`);
                }
            }
        } else if (command === "tp" && Number.isFinite(Number(parts[1]))) {
            const x = Math.floor(Number(parts[1])) + 0.5;
            this.teleportTo(x, Number.isFinite(Number(parts[2])) ? Number(parts[2]) : undefined);
        } else if (command === "summon") {
            const kind = (parts[1] ?? "").toLowerCase() as MobKind;
            if (!(kind in MOB_KINDS)) this.addChat(`${text("未知实体", "Unknown entity")} "${parts[1] ?? ""}". ${text("实体列表", "Entities")}: ${Object.keys(MOB_KINDS).join(", ")}`);
            else {
                let x = this.player.x + this.player.facing * 1.5;
                let y = this.player.y;
                if (Number.isFinite(Number(parts[2]))) x = Number(parts[2]);
                if (Number.isFinite(Number(parts[3]))) y = Number(parts[3]);
                // 数量（第 5 个参数，1~64，默认 1）：沿水平方向排成一排
                const count = Number.isFinite(Number(parts[4])) ? Math.max(1, Math.min(64, Math.floor(Number(parts[4])))) : 1;
                for (let i = 0; i < count; i += 1) {
                    this.mobs.summon(kind, x + (i - (count - 1) / 2) * 0.6, y);
                }
                this.addChat(`${text("召唤", "Summoned")} ${count}× ${kind} @ ${x.toFixed(1)}, ${y.toFixed(1)}`);
            }
        } else if (command === "structure") {
            await this.handleStructureCommand(parts);
        } else if (command === "reload") {
            await this.handleReloadCommand(parts);
        } else this.addChat("Unknown or invalid command");
    }

    /**
     * /reload [images | animations | hitboxes | plugins | all] — 就地刷新资源与配置，
     * 无需重开页面。默认全部重载。
     */
    private async handleReloadCommand(parts: string[]): Promise<void> {
        const part = (parts[1] ?? "all").toLowerCase();
        if (!["images", "animations", "hitboxes", "plugins", "all"].includes(part)) {
            this.addChat(`${text("未知的重载目标", "Unknown reload target")}. ${text("目标", "Targets")}: images, animations, hitboxes, plugins, all`);
            return;
        }
        const reloaded: string[] = [];
        if (part === "images" || part === "all") {
            this.blockImages.clear();
            this.biomeImages.clear();
            this.guiImages.clear();
            [...new Set([...blockRegistry.list().map((block) => block.id), ...plugins.blocks.keys()].filter((type): type is string => type !== null))].forEach((type) => this.loadBlock(type, true));
            this.loadGui("mode_creative", "/assets/gui/gamemode/creative.png", true);
            this.loadGui("mode_spectator", "/assets/gui/gamemode/spectator.png", true);
            this.loadGui("mouse", "/assets/gui/mouse/mouse.png", true);
            this.loadGui("mouse_attack", "/assets/gui/mouse/attack.png", true);
            this.loadGui("mouse_left_broke", "/assets/gui/mouse/mouse_left_broke.png", true);
            this.loadGui("mouse_right_place_and_move", "/assets/gui/mouse/mouse_right_place_and_move.png", true);
            this.loadGui("move_fly", "/assets/gui/movemode/creative_fly.png", true);
            this.loadGui("move_walk", "/assets/gui/movemode/creative_walk.png", true);
            reloadCharacterImages();
            reloaded.push("images");
        }
        if (part === "animations" || part === "all") {
            await reloadCharacterAnimations();
            reloaded.push("animations");
        }
        if (part === "hitboxes" || part === "all") {
            await loadHitboxes();
            this.mobs.refreshHitboxes();
            reloaded.push("hitboxes");
        }
        if (part === "plugins" || part === "all") {
            await this.reloadPlugins();
            // 插件可能注册了碰撞箱覆盖：重新应用到现有生物上，避免显示/碰撞沿用旧值。
            this.mobs.refreshHitboxes();
            reloaded.push("plugins");
        }
        this.addChat(`${text("重载完成", "Reloaded")}: ${reloaded.join(", ")}`);
    }

    /** 卸载全部插件后重新安装（带缓存爆破），并刷新新增插件的方块贴图。 */
    private async reloadPlugins(): Promise<void> {
        plugins.unregisterAll();
        pluginReports.length = 0;
        await loadExternalPlugins(true);
        [...plugins.blocks.keys()].forEach((type) => this.loadBlock(type, true));
        storage.log("Plugins reloaded", {count: plugins.plugins.size});
    }

    /** /structure export|load|list|delete — save/place custom structures.
     *  export/load first prep a previewed region; appending `confirm` commits it. */
    private async handleStructureCommand(parts: string[]): Promise<void> {
        const sub = parts[1]?.toLowerCase() ?? "";
        const name = parts[2] ?? "";
        if (sub === "export") {
            if (name === "confirm") {
                const pending = this.structurePending;
                if (!pending || pending.mode !== "export") {
                    this.addChat("No pending export. Run /structure export <name> first");
                    return;
                }
                const blocks: Record<string, string> = {};
                this.world.updateView(Math.floor(pending.x0 + pending.width / 2));
                for (let sx = 0; sx < pending.width; sx += 1) {
                    for (let sy = 0; sy < pending.height; sy += 1) {
                        const id = this.world.getBlockId(pending.x0 + sx, pending.y0 + sy);
                        if (id) blocks[`${sx},${sy}`] = id;
                    }
                }
                const ok = await storage.saveStructure({
                    id: pending.name,
                    width: pending.width,
                    height: pending.height,
                    blocks
                }, username);
                this.structurePending = null;
                this.addChat(ok ? `Structure "${pending.name}" exported (${Object.keys(blocks).length} blocks)` : "Failed to save structure");
                return;
            }
            if (!STRUCTURE_NAME.test(name)) {
                this.addChat("Invalid structure name (letters, digits, - and _)");
                return;
            }
            const width = Math.max(1, Math.min(64, Math.floor(Number(parts[3]) || 16)));
            const height = Math.max(1, Math.min(64, Math.floor(Number(parts[4]) || 8)));
            const center = Math.floor(this.player.x);
            const x0 = center - Math.floor(width / 2);
            const y0 = this.world.getSurfaceHeight(center);
            this.world.updateView(center);
            this.structurePending = {mode: "export", name, x0, y0, width, height};
            this.addChat(`Range marked for export "${name}" (${width}x${height}). Run /structure export confirm to commit`);
        } else if (sub === "load") {
            if (name === "confirm") {
                const pending = this.structurePending;
                if (!pending || pending.mode !== "load") {
                    this.addChat("No pending load. Run /structure load <name> first");
                    return;
                }
                const structure = await storage.loadStructure(pending.name, username);
                if (!structure) {
                    this.structurePending = null;
                    this.addChat(`Structure "${pending.name}" not found`);
                    return;
                }
                this.world.updateView(pending.x0 + Math.floor(pending.width / 2));
                let placed = 0;
                for (const [cell, id] of Object.entries(structure.blocks)) {
                    const comma = cell.indexOf(",");
                    const sx = Number(cell.slice(0, comma));
                    const sy = Number(cell.slice(comma + 1));
                    if (this.world.setBlock(pending.x0 + sx, pending.y0 + sy, id)) placed += 1;
                }
                this.structurePending = null;
                this.save();
                this.addChat(`Structure "${structure.id}" loaded (${placed} blocks)`);
                return;
            }
            if (!STRUCTURE_NAME.test(name)) {
                this.addChat("Invalid structure name");
                return;
            }
            const structure = await storage.loadStructure(name, username);
            if (!structure) {
                this.addChat(`Structure "${name}" not found`);
                return;
            }
            const anchor = Number.isFinite(Number(parts[3])) ? Math.floor(Number(parts[3])) : Math.floor(this.player.x);
            this.world.updateView(anchor);
            const x0 = anchor - Math.floor(structure.width / 2);
            const y0 = this.world.getSurfaceHeight(anchor);
            this.structurePending = {
                mode: "load",
                name,
                x0,
                y0,
                width: structure.width,
                height: structure.height,
                blocks: structure.blocks
            };
            this.addChat(`Load position set for "${name}" (${structure.width}x${structure.height}). Run /structure load confirm to place`);
        } else if (sub === "list") {
            const list = await storage.listStructures(username);
            if (!list.length) {
                this.addChat("No saved structures");
                return;
            }
            this.addChat(`Structures: ${list.map((item) => `${item.id} (${item.width}x${item.height})`).join(", ")}`);
        } else if (sub === "delete") {
            if (!STRUCTURE_NAME.test(name)) {
                this.addChat("Invalid structure name");
                return;
            }
            await storage.deleteStructure(name, username);
            this.structurePending = null;
            this.addChat(`Structure "${name}" deleted`);
        } else {
            this.addChat("Usage: /structure <export|load|list|delete> [name] [args] - export/load need a confirm step");
        }
    }

    /** Nearest column matching the biome tag, scanned outward from the player. */
    private locateBiome(tag: string): number | null {
        const center = Math.floor(this.player.x);
        for (let radius = 1; radius <= LOCATE_RANGE; radius += 1) {
            if (biomeAt(center + radius, this.world.seed).id === tag) return center + radius + 0.5;
            if (biomeAt(center - radius, this.world.seed).id === tag) return center - radius + 0.5;
        }
        return null;
    }

    private teleportTo(x: number, y?: number): void {
        this.world.updateView(x);
        this.player.x = x;
        this.player.y = y ?? this.world.getSurfaceHeight(Math.floor(x)) + 1;
        this.player.velocityX = 0;
        this.player.velocityY = 0;
        this.cameraOffsetX = 0;
        this.cameraOffsetY = 0;
        this.save();
    }

    private addChat(text: string, color = "#ffffff"): void {
        this.chatMessages.push({text, color: this.messageColor(color), age: 0});
        this.chatMessages = this.chatMessages.slice(-200);
        this.chatScroll = 0;
    }

    private titleMessage: {
        title: string;
        color: string;
        subtitle?: string;
        subtitleColor: string;
        age: number;
        duration: number
    } | null = null;

    private messageColor(color?: string): string {
        return color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff";
    }

    private sendPluginChat = (text: string, options?: { color?: string }): void => {
        this.addChat(text.slice(0, 160), options?.color);
    };

    private sendPluginTitle = (title: string, options?: {
        color?: string;
        subtitle?: string;
        subtitleColor?: string;
        duration?: number
    }): void => {
        this.titleMessage = {
            title: title.slice(0, 100),
            color: this.messageColor(options?.color),
            subtitle: options?.subtitle?.slice(0, 140),
            subtitleColor: this.messageColor(options?.subtitleColor),
            age: 0,
            duration: Math.max(0.5, Math.min(15, options?.duration ?? 3)),
        };
    };

    private getSuggestions(): string[] {
        if (!this.chatText.startsWith("/")) return [];
        const body = this.chatText.slice(1);
        const parts = body.split(/\s+/);
        const trailing = body.endsWith(" ");
        if (!parts[0]) return CHAT_COMMANDS.map((command) => `/${command}`);
        if (parts.length === 1 && !trailing) return CHAT_COMMANDS.filter((command) => command.startsWith(parts[0].toLowerCase())).map((command) => `/${command}`);
        const command = parts[0].toLowerCase();
        // /tp：Tab 补全当前坐标（整数）。无参数时一次给出 "x y"，已有 x 时补 y。
        if (command === "tp") {
            const args = parts.slice(1).filter(Boolean);
            if (args.length === 0) return [`${Math.floor(this.player.x)} ${Math.floor(this.player.y)}`];
            if (args.length === 1) return [String(Math.floor(this.player.y))];
        }
        const prefix = trailing ? "" : parts.at(-1)?.toLowerCase() || "";
        return (CHAT_ARG_SUGGESTIONS[command] || []).filter((argument) => argument.startsWith(prefix));
    }

    private resetSuggestions(): void {
        this.suggestionIndex = 0;
        this.suggestions = [];
    }

    /** 当前可见聊天（关闭时按 7 秒淡出过滤）的折行总数，供滚动换算。 */
    private chatLineCount(): number {
        const maxWidth = Math.min(window.innerWidth - 28, 600) - 16;
        const messages = this.chatOpen ? this.chatMessages : this.chatMessages.filter((message) => message.age < 7);
        let count = 0;
        for (const message of messages) count += this.wrapTextLines(message.text, maxWidth).length;
        return count;
    }

    /** 把文本按最大宽度折成多行（canvas 测量，与输入框 soft-wrap 一致）。 */
    private wrapTextLines(text: string, maxWidth: number): string[] {
        const ctx = this.ctx;
        ctx.font = `${settings.chatFontSize}px ui-monospace, 'LXGW WenKai', monospace`;
        const lines: string[] = [];
        let current = "";
        let width = 0;
        for (const ch of text) {
            const w = ctx.measureText(ch).width;
            if (width + w > maxWidth && current) {
                lines.push(current);
                current = ch;
                width = w;
            } else {
                current += ch;
                width += w;
            }
        }
        if (current) lines.push(current);
        return lines.length ? lines : [""];
    }

    /** 按命令语法给一行文本上色（/命令=金，子命令=绿，数字=蓝，其余=灰）；普通聊天保持原色。 */
    private drawChatLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fallbackColor: string, maxWidth: number): void {
        if (!text.startsWith("> /") && !text.startsWith("/")) {
            ctx.fillStyle = fallbackColor;
            ctx.fillText(text, x, y);
            return;
        }
        const tokenRe = /(\S+)/g;
        let last = 0;
        let consumed = 0;
        const drawToken = (token: string, color: string): void => {
            const w = ctx.measureText(token).width;
            if (consumed + w > maxWidth) return;
            ctx.fillStyle = color;
            ctx.fillText(token, x + consumed, y);
            consumed += w;
        };
        for (const match of text.matchAll(tokenRe)) {
            const token = match[1];
            const start = match.index ?? 0;
            const space = text.slice(last, start);
            if (space) {
                const w = ctx.measureText(space).width;
                if (consumed + w > maxWidth) break;
                ctx.fillStyle = fallbackColor;
                ctx.fillText(space, x + consumed, y);
                consumed += w;
            }
            last = start + token.length;
            const lower = token.toLowerCase();
            const color = /^-?\d+(\.\d+)?$/.test(token) ? "#79c0ff"
                : lower.startsWith(">") || lower.startsWith("/") || CHAT_COMMANDS.includes(lower.replace(/^[>\/]+/, "")) ? "#f5dc8e"
                : Object.values(CHAT_ARG_SUGGESTIONS).some((list) => list.includes(lower)) ? "#8de0a5"
                : "#d2d9d5";
            drawToken(token, color);
            if (consumed >= maxWidth) break;
        }
    }

    /** 绘制命令提示块（自动换行），返回面板顶部 y；悬停的块变黄，点击可补全。 */
    private renderSuggestionChips(ctx: CanvasRenderingContext2D, suggestions: string[], bottom: number, width: number): number {
        const fontSize = settings.chatFontSize;
        const chipH = fontSize + 12;
        const gap = 6;
        const boxW = width - 28;
        const left = 14;
        const padX = 10;
        ctx.font = `${fontSize}px ui-monospace, 'LXGW WenKai', monospace`;
        const areas: Array<{x: number; y: number; w: number; h: number; suggestion: string}> = [];
        let x = left + 8;
        let y = bottom - chipH - 6;
        let top = y;
        for (const suggestion of suggestions) {
            const textW = ctx.measureText(suggestion).width;
            const chipW = textW + padX * 2;
            if (x + chipW > left + boxW - 8 && x > left + 8) {
                x = left + 8;
                y -= chipH + 4;
                top = y;
            }
            areas.push({x, y, w: chipW, h: chipH, suggestion});
            x += chipW + gap;
        }
        this.suggestionHitAreas = areas;
        const panelTop = top - 4;
        ctx.fillStyle = "rgba(0,0,0,.78)";
        ctx.fillRect(left, panelTop, boxW, bottom - panelTop);
        ctx.textBaseline = "middle";
        for (const area of areas) {
            const hovered = this.lastMouseX >= area.x && this.lastMouseX <= area.x + area.w
                && this.lastMouseY >= area.y && this.lastMouseY <= area.y + area.h;
            ctx.fillStyle = hovered ? "#e2bc68" : "#28434a";
            ctx.fillRect(area.x, area.y, area.w, area.h);
            ctx.fillStyle = hovered ? "#14222a" : area.suggestion.startsWith("/") ? "#f5dc8e" : "#8de0a5";
            ctx.fillText(area.suggestion, area.x + padX, area.y + chipH / 2 + 0.5);
        }
        ctx.textBaseline = "alphabetic";
        return panelTop;
    }

    private snapBlockSize(size: number): number {
        return Math.max(16, Math.min(72, Math.round(size)));
    }

    private hotbarSlotAt(clientX: number, clientY: number): number {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const slot = 48;
        const barWidth = slot * this.hotbar.length;
        const x = (width - barWidth) / 2;
        if (clientY < height - 60 || clientY > height - 18) return -1;
        const index = Math.floor((clientX - x) / slot);
        return index >= 0 && index < this.hotbar.length ? index : -1;
    }

    private place(mouseX: number, mouseY: number): void {
        const rect = this.canvas.getBoundingClientRect();
        this.lastMouseX = mouseX - rect.left;
        this.lastMouseY = mouseY - rect.top;
        const target = this.getPlacementTarget();
        if (!target) return;
        const [placeX, placeY] = target;
        if (this.world.getBlock(placeX, placeY)) return;
        const left = this.player.x - 0.25;
        const right = this.player.x + 0.25;
        const playerBottom = this.player.y;
        const playerTop = playerBottom + 1.9;
        if (left < placeX + 1 && right > placeX && playerBottom < placeY && playerTop > placeY - 1) return;
        const type = this.hotbar[this.selected];
        if (!type) return;
        if (this.world.placeBlock(placeX, placeY, type)) {
            this.notice = text("方块已放置", "Block placed");
            this.noticeTimer = 1;
            this.save();
            plugins.notifyBlockPlaced({...this.pluginContext(), x: placeX, y: placeY, type});
            storage.log("Block placed", {world: this.meta.name, x: placeX, y: placeY, type});
        }
    }

    private tick = (now: number): void => {
        if (!this.active) return;
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.frame += 1;
        this.lastMouseX = this.lastMouseX || window.innerWidth / 2;
        this.lastMouseY = this.lastMouseY || window.innerHeight / 2;
        this.chatMessages.forEach((message) => {
            message.age += dt;
        });
        if (this.titleMessage) {
            this.titleMessage.age += dt;
            if (this.titleMessage.age >= this.titleMessage.duration) this.titleMessage = null;
        }
        if (this.noticeTimer > 0) this.noticeTimer -= dt;
        this.squeezeIframe = Math.max(0, this.squeezeIframe - dt);
        if (!this.paused && !this.chatOpen && !this.inventoryOpen) {
            if (!this.spectate) this.mode.update({
                player: this.player,
                world: this.world,
                keys: this.keys,
                mouseDown: this.mouseDown,
                hovered: this.hovered(),
                mouseWorld: this.worldAtMouse(),
                mobs: this.mobs,
                blockSize: this.blockSize,
                dt,
                textures: this.blockImages,
                onBlockBroken: (x, y, type) => {
                    plugins.notifyBlockBroken({...this.pluginContext(), x, y, type});
                    storage.log("Block broken", {world: this.meta.name, x, y, type});
                }
            });
            if (this.player.flying !== this.lastFlying) {
                this.lastFlying = this.player.flying;
                plugins.notifyFlyChanged({...this.pluginContext(), flying: this.player.flying});
                storage.log("Fly mode changed", {world: this.meta.name, flying: this.player.flying});
            }
            this.world.updateView(this.player.x);
            this.updateVoid(dt);
            this.updateSqueeze(dt);
            this.fx.update(dt);
            const damagePlayer = this.modeName === "creative" ? () => undefined : (amount: number) => this.damagePlayer(amount);
            this.mobs.update(dt, this.world, this.player, damagePlayer, (kind, x, y) => {
                this.fx.burst(x, y, characterParticleTexture(kind));
                const name = kind.startsWith("zombie") ? text("僵尸", "Zombie")
                    : kind.startsWith("husk") ? text("尸壳", "Husk")
                    : kind.startsWith("drowned") ? text("溺尸", "Drowned")
                    : kind.startsWith("pig") ? text("猪", "Pig")
                    : kind.startsWith("cow") ? text("牛", "Cow")
                    : text("哞菇", "Mooshroom");
                this.addChat(text("你击败了", "You slew") + ` ${name}`, "#ffd24a");
                plugins.notifyMobKilled({...this.pluginContext(), kind, x, y});
                storage.log("Mob killed", {world: this.meta.name, kind, x, y});
            }, !this.spectate, (damage, undead) => {
                // MC 式实体挤压伤害：创造/旁观模式免伤；1s 无敌帧；亡灵挤压附带 5s 缓慢
                if (this.modeName === "creative" || this.spectate || this.squeezeIframe > 0) return;
                this.squeezeIframe = PLAYER_SQUEEZE_IFRAME;
                if (undead) this.player.slowTimer = UNDEAD_SLOW_SECONDS;
                damagePlayer(damage);
            });
            plugins.notifyGameTick({...this.pluginContext(), dt});
            this.autosaveElapsed += dt;
            if (settings.autosaveInterval > 0 && this.autosaveElapsed >= settings.autosaveInterval) {
                this.save();
                this.autosaveElapsed = 0;
            }
        }
        this.render();
        requestAnimationFrame(this.tick);
    };

    private updateVoid(dt: number): void {
        if (this.modeName !== "creative" || this.player.y >= WORLD_MIN_Y - 2) {
            this.voidDamageTimer = 0;
            return;
        }
        this.voidDamageTimer += dt;
        this.health = Math.max(0, this.health - 20 * dt);
        if (this.health <= 0) {
            const spawnXPos = spawnX(this.meta.seed ?? 0);
            const spawnYPos = this.world.getSurfaceHeight(spawnXPos) + 0.001;
            this.player.reset(spawnXPos, spawnYPos);
            this.health = 20;
            this.save();
            this.notice = text("你掉入虚空并重生了", "You fell into the void and respawned");
            this.noticeTimer = 3;
            plugins.notifyPlayerRespawn(this.pluginContext());
            storage.log("Player respawned", {world: this.meta.name, reason: "void"});
        }
    }

    /** 方块挤压（窒息）伤害：玩家身体与实心方块重叠时每 0.5s 受 1 点伤害。
     *  格子坐标 = 方块顶面（cell [c-1, c)），查碰撞箱接触到的所有格子（floor(边缘)+1 ..
     *  ceil(边缘)）；脚底 0.001 留边落在空气格，站立时不会误判地面。 */
    private updateSqueeze(dt: number): void {
        if (this.modeName !== "creative" || this.spectate) {
            this.squeezeTimer = 0;
            return;
        }
        const p = this.player;
        let inside = false;
        for (let x = Math.floor(p.x - p.halfWidth) + 1; x <= Math.ceil(p.x + p.halfWidth) && !inside; x += 1) {
            for (let y = Math.floor(p.y) + 1; y <= Math.ceil(p.y + p.height); y += 1) {
                if (this.world.isSolid(x, y)) {
                    inside = true;
                    break;
                }
            }
        }
        if (!inside) {
            this.squeezeTimer = 0;
            return;
        }
        this.squeezeTimer += dt;
        if (this.squeezeTimer >= 0.5) {
            this.squeezeTimer = 0;
            this.damagePlayer(1);
        }
    }

    private damagePlayer(amount: number): void {
        if (this.spectate) return;
        this.health = Math.max(0, this.health - amount);
        plugins.notifyPlayerHurt({...this.pluginContext(), amount, health: this.health});
        if (this.health <= 0) {
            const spawnXPos = spawnX(this.meta.seed ?? 0);
            const spawnYPos = this.world.getSurfaceHeight(spawnXPos) + 0.001;
            this.player.reset(spawnXPos, spawnYPos);
            this.health = 20;
            this.save();
            this.notice = text("你被怪物击败并重生了", "You were slain and respawned");
            this.noticeTimer = 3;
            plugins.notifyPlayerRespawn(this.pluginContext());
            storage.log("Player respawned", {world: this.meta.name, reason: "mob"});
        }
    }

    private loadBlock(type: string, bust = false): void {
        const image = new Image();
        image.onload = () => this.biomeImages.clear();
        image.onerror = () => {
            const definition = blockRegistry.get(type);
            const canvas = document.createElement("canvas");
            canvas.width = 16;
            canvas.height = 16;
            const cctx = canvas.getContext("2d");
            if (cctx) {
                cctx.fillStyle = definition?.color ?? "#8b8b8b";
                cctx.fillRect(0, 0, 16, 16);
            }
            this.blockImages.set(type, canvas);
            this.biomeImages.clear();
        };
        const block = blockRegistry.get(type);
        const texture = block?.texture || block?.path || type;
        const src = texture.startsWith("/") ? texture : `/assets/block/${texture}.png`;
        image.src = bust ? `${src}?t=${Date.now()}` : src;
        this.blockImages.set(type, image);
    }

    /** Raw texture for a block id, or a biome-tinted variant for grass/leaves at column `x`. */
    private blockImageFor(id: string, x: number): HTMLImageElement | HTMLCanvasElement | undefined {
        if (id === Blocks.MY2DWORLD.GRASS_BLOCK.id) return this.biomeTexture("grass_block", biomeAt(x, this.world.seed));
        if (id === Blocks.MY2DWORLD.OAK_LEAVES.id) return this.biomeTexture("leaves", biomeAt(x, this.world.seed));
        if (id === Blocks.MY2DWORLD.SHORT_GRASS.id) return this.biomeTexture("short_grass", biomeAt(x, this.world.seed));
        return this.blockImages.get(id);
    }

    /** Icon texture for inventory/hotbar slots (uses a neutral biome tint). */
    private iconFor(type: string): HTMLImageElement | HTMLCanvasElement | undefined {
        if (type === Blocks.MY2DWORLD.GRASS_BLOCK.id) return this.biomeTexture("grass_block", DEFAULT_BIOME);
        if (type === Blocks.MY2DWORLD.OAK_LEAVES.id) return this.biomeTexture("leaves", DEFAULT_BIOME);
        if (type === Blocks.MY2DWORLD.SHORT_GRASS.id) return this.biomeTexture("short_grass", DEFAULT_BIOME);
        return this.blockImages.get(type);
    }

    /**
     * Procedurally draws a chunky pixel-art grass cap on a dirt side. The ragged
     * bottom edge runs in short column runs and brightness varies per low-res
     * cell (not per pixel), so it reads like the rest of the sprite art.
     */
    private drawGrassCap(ctx: CanvasRenderingContext2D, size: number, biome: Biome): void {
        const seed = biome.id.split("").reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 0);
        const h01 = (s: number): number => {
            const v = Math.sin(s) * 43758.5453123;
            return v - Math.floor(v);
        };
        const base = Math.max(4, Math.round(size * 0.42));
        const cell = Math.max(2, Math.round(size / 8));
        const run = Math.max(2, Math.round(size / 6));
        for (let px = 0; px < size; px += run) {
            // One discrete edge offset shared by a whole run of columns -> blocky fringe.
            const edge = h01(seed ^ Math.imul(Math.floor(px / run), 0x5bd1e995));
            const bottom = Math.max(1, Math.min(size, base - 1 + Math.round(edge * 4)));
            for (let cx = px; cx < px + run && cx < size; cx += 1) {
                for (let y = 0; y < bottom && y < size; y += 1) {
                    const cellId = Math.floor(cx / cell) * 131 + Math.floor(y / cell) * 571;
                    let f = 1 + (h01(seed ^ Math.imul(cellId, 0x45d9f3b)) - 0.5) * 0.28;
                    const d = bottom - 1 - y;
                    if (d === 0) f *= 0.86;
                    ctx.globalAlpha = d < 3 ? 0.4 + d * 0.3 : 1;
                    ctx.fillStyle = shadeColor(biome.grass, Math.max(0.5, Math.min(1.16, f)));
                    ctx.fillRect(cx, y, 1, 1);
                }
            }
        }
    }

    /**
     * MC-style biome-tinted grass/leaves: base texture plus a tinted overlay.
     * Grass = dirt side + grass overlay whose hue/brightness follows the biome
     * colour; leaves = the leaf texture multiplied by the biome foliage colour.
     */
    private biomeTexture(kind: "grass_block" | "leaves" | "short_grass", biome: Biome): HTMLCanvasElement | undefined {
        const key = `${kind}|${biome.id}`;
        const cached = this.biomeImages.get(key);
        if (cached) return cached;
        const size = this.blockSize;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        ctx.imageSmoothingEnabled = false;
        if (kind === "grass_block") {
            const dirt = this.blockImages.get(Blocks.MY2DWORLD.DIRT.id);
            if (!dirt || !("naturalWidth" in dirt) || !dirt.complete || !dirt.naturalWidth) return undefined;
            ctx.drawImage(dirt, 0, 0, size, size);
            this.drawGrassCap(ctx, size, biome);
        } else {
            const texture = kind === "leaves"
                ? this.blockImages.get(Blocks.MY2DWORLD.OAK_LEAVES.id)
                : this.blockImages.get(Blocks.MY2DWORLD.SHORT_GRASS.id);
            if (!texture || !("naturalWidth" in texture) || !texture.complete || !texture.naturalWidth) return undefined;
            ctx.drawImage(texture, 0, 0, size, size);
            ctx.globalCompositeOperation = "multiply";
            ctx.fillStyle = kind === "leaves" ? biome.foliage : biome.grass;
            ctx.fillRect(0, 0, size, size);
            ctx.globalCompositeOperation = "source-over";
        }
        this.biomeImages.set(key, canvas);
        return canvas;
    }

    private loadGui(key: string, src: string, bust = false): void {
        const image = new Image();
        image.src = bust ? `${src}?t=${Date.now()}` : src;
        this.guiImages.set(key, image);
    }

    private loadImage(src: string): HTMLImageElement {
        const image = new Image();
        image.src = src;
        return image;
    }

    private pluginContext(): PluginGameContext {
        return {
            username,
            meta: this.meta,
            world: this.world,
            player: this.player,
            mode: this.modeName,
            spectate: this.spectate,
            flying: this.player.flying,
            messages: plugins.messages,
        };
    }

    private stop(reason: string): void {
        if (!this.active) return;
        this.active = false;
        this.save();
        plugins.notifyGameStop({...this.pluginContext(), reason});
        plugins.setMessageTarget(null);
        storage.log("Game stopped", {world: this.meta.name, reason});
    }

    private toggleInventory(): void {
        this.inventoryOpen = !this.inventoryOpen;
        if (this.inventoryOpen) return;
        if (this.heldInventoryItem) {
            const emptyIndex = this.inventorySlots.findIndex((item) => item === null);
            if (emptyIndex >= 0) this.inventorySlots[emptyIndex] = this.heldInventoryItem;
            else this.hotbar[this.selected] = this.heldInventoryItem;
            this.heldInventoryItem = null;
        }
    }

    private inventoryLayout(): {
        panelX: number;
        panelY: number;
        gridX: number;
        gridY: number;
        hotbarX: number;
        hotbarY: number;
        slot: number
    } {
        const scale = Math.min(window.innerWidth, window.innerHeight) / 512;
        const slot = CREATIVE_INVENTORY_GUI.slotSize * scale;
        const panelW = 512 * scale;
        const panelH = 512 * scale;
        const panelX = (window.innerWidth - panelW) / 2;
        const panelY = (window.innerHeight - panelH) / 2;
        return {
            panelX,
            panelY,
            gridX: panelX + CREATIVE_INVENTORY_GUI.gridOffsetX * scale,
            gridY: panelY + CREATIVE_INVENTORY_GUI.gridOffsetY * scale,
            hotbarX: panelX + CREATIVE_INVENTORY_GUI.hotbarOffsetX * scale,
            hotbarY: panelY + CREATIVE_INVENTORY_GUI.hotbarOffsetY * scale,
            slot,
        };
    }

    private inventorySlotAt(clientX: number, clientY: number): { kind: "inventory" | "hotbar"; index: number } | null {
        const layout = this.inventoryLayout();
        const column = Math.floor((clientX - layout.gridX) / layout.slot);
        const row = Math.floor((clientY - layout.gridY) / layout.slot);
        if (column >= 0 && column < 9 && row >= 0 && row < 3) return {kind: "inventory", index: row * 9 + column};
        const hotbarColumn = Math.floor((clientX - layout.hotbarX) / layout.slot);
        const hotbarRow = Math.floor((clientY - layout.hotbarY) / layout.slot);
        if (hotbarColumn >= 0 && hotbarColumn < 9 && hotbarRow === 0) return {kind: "hotbar", index: hotbarColumn};
        return null;
    }

    private handleInventoryClick(clientX: number, clientY: number): void {
        const slot = this.inventorySlotAt(clientX, clientY);
        if (!slot) return;
        const slots = slot.kind === "hotbar" ? this.hotbar : this.inventorySlots;
        const slotItem = slots[slot.index];
        slots[slot.index] = this.heldInventoryItem;
        this.heldInventoryItem = slotItem;
        if (slot.kind === "hotbar") this.selected = slot.index;
        storage.log("Creative inventory slot changed", {
            world: this.meta.name,
            slot: slot.index,
            row: slot.kind,
            heldItem: this.heldInventoryItem
        });
    }

    private handleMenuClick(clientX: number, clientY: number): void {
        const boxW = Math.min(460, window.innerWidth - 40);
        const x = (window.innerWidth - boxW) / 2;
        const menuHeight = this.menu === "bindings" ? 680 : this.menu === "settings" ? 540 : this.menu === "plugins" ? Math.min(620, window.innerHeight - 40) : this.menu === "pause" ? 476 : this.menu === "display" ? 480 : 410;
        const y = (window.innerHeight - menuHeight) / 2;
        if (clientX < x + 52 || clientX > x + boxW - 52) return;
        if (this.menu === "plugins") {
            if (clientY >= y + menuHeight - 72 && clientY <= y + menuHeight - 28) this.menu = "pause";
            return;
        }
        const index = Math.floor((clientY - (y + (this.menu === "bindings" ? 82 : 92))) / (this.menu === "bindings" ? 55 : 66));
        if (index < 0 || index > (this.menu === "bindings" ? 9 : this.menu === "settings" ? 6 : this.menu === "display" ? 5 : this.menu === "pause" ? 3 : 2)) return;
        const rowY = y + (this.menu === "bindings" ? 82 : 92) + index * (this.menu === "bindings" ? 55 : 66);
        const rowH = this.menu === "bindings" ? 42 : 44;
        if (clientY < rowY || clientY > rowY + rowH) return;
        if (this.menu === "pause") {
            if (index === 0) {
                this.menu = null;
                this.paused = false;
                plugins.notifyGameResume(this.pluginContext());
                storage.log("Game resumed", {world: this.meta.name});
            }
            if (index === 1) this.menu = "settings";
            if (index === 2) this.menu = "plugins";
            if (index === 3) {
                this.stop("world-list");
                app!.innerHTML = "";
                document.body.innerHTML = "";
                document.body.appendChild(app!);
                void renderWorlds();
            }
            return;
        }
        if (this.menu === "settings") {
            if (index === 0) toggleLanguage();
            if (index === 1) {
                this.debug = !this.debug;
                settings.debugDefault = this.debug;
                storage.saveSettings(settings);
            }
            if (index === 2) {
                settings.autosaveInterval = nextAutosave(settings.autosaveInterval);
                storage.saveSettings(settings);
            }
            if (index === 3) {
                settings.cursorStyle = settings.cursorStyle === "crosshair" ? "default" : "crosshair";
                storage.saveSettings(settings);
            }
            if (index === 4) this.menu = "display";
            if (index === 5) this.menu = "bindings";
            if (index === 6) this.menu = "pause";
            return;
        }
        if (this.menu === "display") {
            if (index === 0) {
                settings.placementAlpha = nextPreset(settings.placementAlpha, ALPHA_PRESETS);
                storage.saveSettings(settings);
            }
            if (index === 1) {
                settings.placementBrightness = nextPreset(settings.placementBrightness, BRIGHTNESS_PRESETS);
                storage.saveSettings(settings);
            }
            if (index === 2) {
                settings.spectateAlpha = nextPreset(settings.spectateAlpha, ALPHA_PRESETS);
                storage.saveSettings(settings);
            }
            if (index === 3) {
                settings.spectateBrightness = nextPreset(settings.spectateBrightness, BRIGHTNESS_PRESETS);
                storage.saveSettings(settings);
            }
            if (index === 4) {
                settings.chatFontSize = nextPreset(settings.chatFontSize, CHAT_FONT_PRESETS);
                storage.saveSettings(settings);
            }
            if (index === 5) this.menu = "settings";
            return;
        }
        if (index === 9) {
            this.menu = "settings";
            return;
        }
        const key = Object.keys(settings.keyBindings)[index] as keyof KeyBindings;
        if (key) this.bindingCapture = key;
    }

    private save = (): void => {
        const changes = this.world.serializeChanges();
        void storage.saveWorld(this.meta.id, {
            playerX: this.player.x,
            playerY: this.player.y,
            mode: this.modeName,
            idTable: changes.idTable,
            chunks: changes.chunks,
        });
        this.world.clearDirty();
    };

    private render(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const cameraX = this.player.x + this.cameraOffsetX;
        const cameraY = this.player.y + this.cameraOffsetY;
        const ctx = this.ctx;
        ctx.fillStyle = "#82c9d7";
        ctx.fillRect(0, 0, width, height);
        const left = Math.floor(cameraX - width / this.blockSize / 2 - 1);
        const right = Math.ceil(cameraX + width / this.blockSize / 2 + 1);
        const bottom = Math.max(WORLD_MIN_Y, Math.floor(cameraY - height / this.blockSize / 2 - 1));
        const top = Math.ceil(cameraY + height / this.blockSize / 2 + 1);
        for (const [chunkX, chunk] of this.world.chunks) {
            if (chunkX * 16 > right || (chunkX + 1) * 16 < left) continue;
            for (let x = Math.max(left, chunk.start); x < Math.min(right, chunk.start + 16); x += 1) for (let y = bottom; y <= Math.min(top, WORLD_MAX_Y); y += 1) {
                const id = this.world.getBlockId(x, y);
                if (!id) continue;
                const sx = Math.round((x - cameraX) * this.blockSize + width / 2);
                const sy = Math.round((cameraY - y) * this.blockSize + height / 2);
                const image = this.blockImageFor(id, x);
                if (image) ctx.drawImage(image, sx, sy, this.blockSize, this.blockSize); else {
                    const definition = blockRegistry.get(id);
                    ctx.fillStyle = definition?.color ?? "#000000";
                    ctx.fillRect(sx, sy, this.blockSize, this.blockSize);
                }
            }
        }
        const target = this.pointedBlock();
        this.placement = this.getPlacementTarget();
        if (target) {
            const sx = (target[0] - cameraX) * this.blockSize + width / 2;
            const sy = (cameraY - target[1]) * this.blockSize + height / 2;
            ctx.strokeStyle = "rgba(255,255,255,.9)";
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1, sy + 1, this.blockSize - 2, this.blockSize - 2);
        }
        if (this.placement) {
            const [x, y] = this.placement;
            const sx = (x - cameraX) * this.blockSize + width / 2;
            const sy = (cameraY - y) * this.blockSize + height / 2;
            const image = this.iconFor(this.hotbar[this.selected] ?? "");
            if (image && (!("naturalWidth" in image) || (image.complete && image.naturalWidth))) this.drawGhost(ctx, image, sx, sy, this.blockSize, this.blockSize, settings.placementAlpha, settings.placementBrightness); else {
                ctx.fillStyle = "rgba(255,255,255,.25)";
                ctx.fillRect(sx, sy, this.blockSize, this.blockSize);
            }
            ctx.strokeStyle = "rgba(255,255,255,.95)";
            ctx.strokeRect(sx + 1, sy + 1, this.blockSize - 2, this.blockSize - 2);
        }
        if (this.structurePending) {
            const {x0, y0} = this.structurePending;
            const sWidth = this.structurePending.width;
            const sHeight = this.structurePending.height;
            const sx = (x0 - cameraX) * this.blockSize + width / 2;
            const sy = (cameraY - (y0 + sHeight - 1)) * this.blockSize + height / 2;
            const boxW = sWidth * this.blockSize;
            const boxH = sHeight * this.blockSize;
            ctx.fillStyle = "rgba(255,255,255,.10)";
            ctx.fillRect(sx, sy, boxW, boxH);
            ctx.strokeStyle = "rgba(255,255,255,.9)";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(sx + 1, sy + 1, boxW - 2, boxH - 2);
            ctx.setLineDash([]);
            if (this.structurePending.mode === "load" && this.structurePending.blocks) {
                for (const [cell, id] of Object.entries(this.structurePending.blocks)) {
                    const comma = cell.indexOf(",");
                    const wx = this.structurePending.x0 + Number(cell.slice(0, comma));
                    const wy = this.structurePending.y0 + Number(cell.slice(comma + 1));
                    const existing = this.world.getBlockId(wx, wy);
                    const px = (wx - cameraX) * this.blockSize + width / 2;
                    const py = (cameraY - wy) * this.blockSize + height / 2;
                    if (existing && existing !== id) {
                        ctx.fillStyle = "rgba(255,40,40,.4)";
                        ctx.fillRect(px, py, this.blockSize, this.blockSize);
                    } else if (!existing) {
                        ctx.fillStyle = "rgba(60,140,255,.4)";
                        ctx.fillRect(px, py, this.blockSize, this.blockSize);
                    }
                    const image = this.blockImageFor(id, wx);
                    if (image && ("naturalWidth" in image ? image.complete && image.naturalWidth : true)) {
                        ctx.globalAlpha = 0.5;
                        ctx.drawImage(image, px, py, this.blockSize, this.blockSize);
                        ctx.globalAlpha = 1;
                    } else {
                        const definition = blockRegistry.get(id);
                        if (definition) {
                            ctx.globalAlpha = 0.5;
                            ctx.fillStyle = definition.color;
                            ctx.fillRect(px, py, this.blockSize, this.blockSize);
                            ctx.globalAlpha = 1;
                        }
                    }
                }
            }
        }
        if (this.mode instanceof CreativeMode) this.mode.particles.render(ctx, cameraX, cameraY, this.blockSize);
        this.fx.render(ctx, cameraX, cameraY, this.blockSize);
        const playerContext: ModeContext = {
            player: this.player,
            world: this.world,
            keys: this.keys,
            mouseDown: this.mouseDown,
            hovered: this.hovered(),
            mouseWorld: this.worldAtMouse(),
            mobs: this.mobs,
            blockSize: this.blockSize,
            dt: 0,
            textures: this.blockImages
        };
        const drawables: Array<{ depth: number; draw: () => void }> = [];
        for (const mob of this.mobs.mobsNear(this.player, MOB_RENDER_RADIUS)) {
            drawables.push({
                depth: mob.centerY,
                draw: () => {
                    const hurtT = mob.hurtTimer > 0 ? Math.min(1, mob.hurtTimer / 0.35) : 0;
                    renderCharacter(ctx, {
                        kind: mob.kind,
                        pose: mob.state === "attack" ? "attack" : mob.velocityX !== 0 ? "walk" : "idle",
                        time: mob.animationTime,
                        blendKey: mob,
                        x: mob.x,
                        y: mob.y,
                        facing: mob.facing,
                        blockSize: this.blockSize,
                        cameraX,
                        cameraY,
                        tint: hurtT > 0 ? "#ff2d20" : undefined,
                        tintAmount: hurtT,
                    });
                }
            });
        }
        drawables.push({
            depth: this.player.y + this.player.height / 2,
            draw: () => this.mode.renderPlayer(ctx, playerContext, cameraX, cameraY)
        });
        drawables.sort((a, b) => b.depth - a.depth);
        drawables.forEach((entry) => entry.draw());
        // 悬停的生物绘制在方块与其它生物之上，并显示红色高亮框
        if (!this.paused && !this.chatOpen && !this.inventoryOpen) {
            const hoveredMob = this.hoveredMob();
            if (hoveredMob) {
                const sx = (hoveredMob.hitboxLeft - cameraX) * this.blockSize + width / 2;
                const sy = (cameraY - hoveredMob.hitboxTop) * this.blockSize + height / 2;
                const sw = (hoveredMob.hitboxRight - hoveredMob.hitboxLeft) * this.blockSize;
                const sh = (hoveredMob.hitboxTop - hoveredMob.hitboxBottom) * this.blockSize;
                ctx.strokeStyle = "rgba(255,90,70,.95)";
                ctx.lineWidth = 2;
                ctx.strokeRect(sx - 1.5, sy - 1.5, sw + 3, sh + 3);
            }
        }
        if (this.spectate) {
            renderCharacter(ctx, {
                kind: "player",
                pose: this.player.velocityX ? "walk" : "idle",
                time: this.player.animationT,
                blendKey: this.player,
                x: cameraX,
                y: cameraY,
                facing: this.player.facing,
                blockSize: this.blockSize,
                cameraX,
                cameraY,
                alpha: settings.spectateAlpha,
                brightness: settings.spectateBrightness,
            });
        }
        if (this.showHitboxes) this.renderHitboxes(ctx, cameraX, cameraY, width, height);
        this.renderHud(ctx, width, height);
        this.renderCursor();
    }

    /** F5 调试：绘制玩家放置/破坏范围与所有实体的碰撞箱。 */
    private renderHitboxes(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, width: number, height: number): void {
        const bs = this.blockSize;
        const toScreenX = (wx: number) => (wx - cameraX) * bs + width / 2;
        const toScreenY = (wy: number) => (cameraY - wy) * bs + height / 2;
        const drawBox = (sx: number, sy: number, w: number, h: number, color: string, dashed = false) => {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            if (dashed) ctx.setLineDash([8, 5]);
            ctx.strokeRect(sx, sy, w, h);
            ctx.restore();
        };
        // 玩家放置/破坏范围（inReach 判定区域）
        const reachX = 2.5, reachY = 3;
        const centerX = this.player.x;
        const centerY = this.player.y + 0.95;
        drawBox(toScreenX(centerX - reachX), toScreenY(centerY + reachY), reachX * 2 * bs, reachY * 2 * bs, "#39e75f", true);
        // 玩家碰撞箱
        drawBox(toScreenX(this.player.x - this.player.halfWidth), toScreenY(this.player.y + this.player.height), this.player.halfWidth * 2 * bs, this.player.height * bs, "#ffe94d");
        // 生物碰撞箱
        for (const mob of this.mobs.mobsNear(this.player, MOB_RENDER_RADIUS)) {
            drawBox(toScreenX(mob.hitboxLeft), toScreenY(mob.hitboxTop), (mob.hitboxRight - mob.hitboxLeft) * bs, (mob.hitboxTop - mob.hitboxBottom) * bs, "#ff4d4d");
        }
    }

    private drawGhost(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement | undefined, x: number, y: number, w: number, h: number, alpha: number, brightness: number, flip = false, tint = "#000"): void {
        if (!image || ("naturalWidth" in image && (!image.complete || !image.naturalWidth))) return;
        ctx.save();
        if (flip) {
            ctx.translate(x + w, y);
            ctx.scale(-1, 1);
            x = 0;
            y = 0;
        }
        ctx.globalAlpha = alpha;
        ctx.drawImage(image, x, y, w, h);
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = 1 - brightness;
        ctx.fillStyle = tint;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    /** 鼠标指向的生物（在玩家攻击范围内），用于攻击光标与悬停高亮。 */
    private hoveredMob(): Mob | null {
        return this.mobs.hitMob(this.worldAtMouse(), this.player);
    }

    private renderCursor(): void {
        if (this.paused || this.chatOpen || this.inventoryOpen) {
            this.canvas.style.cursor = settings.cursorStyle === "crosshair" ? "crosshair" : "default";
            return;
        }
        if (settings.cursorStyle === "crosshair") {
            this.canvas.style.cursor = "crosshair";
            return;
        }
        this.canvas.style.cursor = "none";
        let key = "mouse";
        const target = this.hovered();
        const placement = this.getPlacementTarget();
        if (this.hoveredMob()) key = "mouse_attack";
        else if (this.modeName === "creative") {
            if (!target && placement) key = "mouse_right_place_and_move";
            else if (target) key = "mouse_left_broke";
        } else if (this.modeName === "spectator" && this.dragging) {
            key = "mouse_right_place_and_move";
        }
        const image = this.guiImages.get(key);
        if (!image?.complete || !image.naturalWidth) {
            this.canvas.style.cursor = "default";
            return;
        }
        const size = 30;
        this.ctx.drawImage(image, this.lastMouseX, this.lastMouseY, size, size);
    }

    private renderHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        ctx.fillStyle = "rgba(9,17,24,.78)";
        ctx.fillRect(18, 18, 184, 60);
        ctx.fillStyle = "#f8f4e7";
        ctx.font = "600 14px ui-monospace";
        ctx.fillText(this.meta.name.toUpperCase(), 32, 43);
        ctx.fillStyle = "#9bb3b3";
        ctx.fillText("[ESC] " + text("暂停", "PAUSE"), 32, 66);
        ctx.fillStyle = "#d95f55";
        ctx.fillRect(18, 92, 184 * (this.health / 20), 6);
        ctx.strokeStyle = "#e7eee5";
        ctx.strokeRect(18, 92, 184, 6);
        const pointed = this.pointedBlock();
        if (pointed) {
            const info = `${this.blockName(pointed[2])} (${pointed[0]}, ${pointed[1]})`;
            ctx.font = "600 15px ui-monospace";
            const infoWidth = ctx.measureText(info).width;
            const infoHeight = 28;
            const infoX = width / 2 - infoWidth / 2 - 12;
            const infoY = 16;
            ctx.fillStyle = "rgba(9,17,24,.78)";
            ctx.fillRect(infoX, infoY, infoWidth + 24, infoHeight);
            ctx.strokeStyle = "rgba(242,214,123,.65)";
            ctx.lineWidth = 1;
            ctx.strokeRect(infoX, infoY, infoWidth + 24, infoHeight);
            ctx.fillStyle = "#f8f4e7";
            ctx.textAlign = "center";
            ctx.fillText(info, width / 2, infoY + 19);
            ctx.textAlign = "left";
        }
        const modeImage = this.guiImages.get(this.modeName === "creative" ? "mode_creative" : "mode_spectator");
        if (modeImage?.complete && modeImage.naturalWidth) {
            ctx.fillStyle = "rgba(9,17,24,.55)";
            ctx.fillRect(width - 18 - 44, 14, 44, 44);
            ctx.drawImage(modeImage, width - 18 - 38, 18, 38, 38);
        }
        if (this.modeName === "creative") {
            const moveImage = this.guiImages.get(this.player.flying ? "move_fly" : "move_walk");
            if (moveImage?.complete && moveImage.naturalWidth) {
                ctx.fillStyle = "rgba(9,17,24,.55)";
                ctx.fillRect(width - 18 - 44, 62, 44, 44);
                ctx.drawImage(moveImage, width - 18 - 38, 66, 38, 38);
            }
        }
        const slot = 48;
        const barWidth = slot * this.hotbar.length;
        ctx.fillStyle = "rgba(9,17,24,.88)";
        ctx.fillRect((width - barWidth) / 2 - 8, height - 68, barWidth + 16, 56);
        this.hotbar.forEach((type, index) => {
            const x = (width - barWidth) / 2 + index * slot;
            ctx.strokeStyle = index === this.selected ? "#f2d67b" : "#52666a";
            ctx.lineWidth = index === this.selected ? 3 : 1;
            ctx.strokeRect(x, height - 60, 42, 42);
            const image = type ? this.iconFor(type) : undefined;
            if (image && (!("naturalWidth" in image) || (image.complete && image.naturalWidth))) ctx.drawImage(image, x + 7, height - 53, 28, 28);
        });
        if (this.debug) {
            ctx.fillStyle = "#102229";
            ctx.fillRect(18, 124, 370, 304);
            ctx.fillStyle = "#d8e4df";
            ctx.font = "12px ui-monospace";
            const lines = [
                `${t(language, "debug_fps")} ${Math.round(1000 / 16)}`,
                `${t(language, "debug_mode")} ${t(language, this.modeName === "creative" ? "mode_creative" : "mode_spectator")}`,
                `${t(language, "debug_world")} ${this.meta.name}`,
                `${t(language, "debug_seed")} ${this.meta.seed ?? 0}`,
                `${t(language, "debug_biome")} ${t(language, `biome_${biomeAt(Math.floor(this.player.x), this.meta.seed ?? 0).id}`)}`,
                `${t(language, "debug_player")} ${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}`,
                `${t(language, "debug_velocity")} ${this.player.velocityX.toFixed(2)}, ${this.player.velocityY.toFixed(2)}`,
                `${t(language, "debug_camera")} ${(this.player.x + this.cameraOffsetX).toFixed(1)}, ${(this.player.y + this.cameraOffsetY).toFixed(1)}`,
                `${t(language, "debug_mouse")} ${this.lastMouseX}, ${this.lastMouseY}`,
                `${t(language, "debug_zoom")} ${Math.round(this.blockSize / 32 * 100)}%`,
                `${t(language, "debug_chunks")} ${this.world.chunks.size}`,
                `${t(language, "debug_mobs")} ${this.mobs.activeCount}/${this.mobs.total}`,
                `${t(language, "debug_textures")} ${this.blockImages.size}`,
                `${t(language, "debug_health")} ${Math.ceil(this.health)}/20`,
                `${t(language, "debug_controls")} ${Object.values(settings.keyBindings).map(keyName).join(" / ")}`,
            ];
            lines.forEach((line, index) => ctx.fillText(line, 30, 147 + index * 16));
        }
        const chatFontSize = settings.chatFontSize;
        const chatLineH = this.chatLineHeight(chatFontSize) + 7;
        const boxWidth = Math.min(width - 28, 600);
        const inputTop = height - 12 - this.chatInputHeight;
        let chatBottom = this.chatOpen ? inputTop : height - 14;
        if (this.chatOpen) {
            const suggestions = this.getSuggestions();
            if (suggestions.length) chatBottom = this.renderSuggestionChips(ctx, suggestions, inputTop - 4, width);
            else this.suggestionHitAreas = [];
        }
        const messages = this.chatOpen ? this.chatMessages : this.chatMessages.filter((message) => message.age < 7);
        const ordered: Array<{message: {text: string; color: string; age: number}; line: string}> = [];
        for (const message of messages) {
            for (const line of this.wrapTextLines(message.text, boxWidth - 16)) ordered.push({message, line});
        }
        const total = ordered.length;
        const end = total - (this.chatOpen ? this.chatScroll : 0);
        const start = Math.max(0, end - 9);
        ctx.font = `${chatFontSize}px ui-monospace, 'LXGW WenKai', monospace`;
        let cursorY = chatBottom - 4;
        for (let i = end - 1; i >= start; i -= 1) {
            const {message, line} = ordered[i];
            cursorY -= chatLineH;
            if (cursorY < 0) break;
            ctx.globalAlpha = this.chatOpen ? 1 : Math.max(0, Math.min(1, (7 - message.age) / 3));
            ctx.fillStyle = "rgba(0,0,0,.6)";
            ctx.fillRect(14, cursorY, boxWidth, chatLineH - 2);
            this.drawChatLine(ctx, line, 22, cursorY + chatLineH - 6, message.color, boxWidth - 16);
        }
        ctx.globalAlpha = 1;
        if (this.chatOpen) {
            ctx.fillStyle = "rgba(0,0,0,.88)";
            ctx.fillRect(14, inputTop, width - 28, this.chatInputHeight);
            ctx.strokeStyle = "#d8e4df";
            ctx.strokeRect(14, inputTop, width - 28, this.chatInputHeight);
            // 输入文本（语法高亮）与光标由叠加的 DOM 层渲染（支持选中/复制/粘贴/输入法）。
        }
        if (this.noticeTimer > 0) {
            ctx.font = "600 16px Manrope";
            const modeImage = this.guiImages.get(this.modeName === "creative" ? "mode_creative" : "mode_spectator");
            const iconSize = 22;
            const iconShown = Boolean(modeImage?.complete && modeImage.naturalWidth);
            const textW = ctx.measureText(this.notice).width;
            if (iconShown) ctx.drawImage(modeImage!, width / 2 - textW / 2 - iconSize - 8, 42 - 8 - iconSize / 2, iconSize, iconSize);
            ctx.textAlign = "center";
            ctx.fillStyle = "#f5dc8e";
            ctx.fillText(this.notice, width / 2, 42);
            ctx.textAlign = "left";
        }
        if (this.titleMessage) {
            const fade = Math.min(1, this.titleMessage.age / 0.2, (this.titleMessage.duration - this.titleMessage.age) / 0.35);
            ctx.save();
            ctx.globalAlpha = Math.max(0, fade);
            ctx.textAlign = "center";
            ctx.font = "700 36px 'LXGW WenKai', Manrope";
            ctx.fillStyle = this.titleMessage.color;
            ctx.fillText(this.titleMessage.title, width / 2, height * 0.36);
            if (this.titleMessage.subtitle) {
                ctx.font = "600 19px 'LXGW WenKai', Manrope";
                ctx.fillStyle = this.titleMessage.subtitleColor;
                ctx.fillText(this.titleMessage.subtitle, width / 2, height * 0.36 + 34);
            }
            ctx.restore();
            ctx.textAlign = "left";
        }
        if (this.inventoryOpen) this.renderInventory(ctx);
        else if (this.paused) this.renderMenu(ctx, width, height);
    }

    private renderInventory(ctx: CanvasRenderingContext2D): void {
        const layout = this.inventoryLayout();
        ctx.fillStyle = "rgba(0, 0, 0, .58)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const background = this.inventoryBackground;
        if (background.complete && background.naturalWidth) {
            ctx.drawImage(background, layout.panelX, layout.panelY, 512 * (Math.min(window.innerWidth, window.innerHeight) / 512), 512 * (Math.min(window.innerWidth, window.innerHeight) / 512));
        } else {
            ctx.fillStyle = "#13252d";
            ctx.fillRect(layout.panelX, layout.panelY, 512 * (Math.min(window.innerWidth, window.innerHeight) / 512), 512 * (Math.min(window.innerWidth, window.innerHeight) / 512));
        }
        ctx.font = "12px ui-monospace";
        ctx.textAlign = "left";
        const drawSlot = (slots: ReadonlyArray<string | null>, gridX: number, gridY: number): void => {
            slots.forEach((type, index) => {
                const x = gridX + (index % 9) * layout.slot;
                const y = gridY + Math.floor(index / 9) * layout.slot;
                ctx.strokeStyle = "#3f5860";
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, layout.slot, layout.slot);
                if (type) {
                    const image = this.iconFor(type);
                    if (image && (!("naturalWidth" in image) || (image.complete && image.naturalWidth))) {
                        const inset = layout.slot * 0.2;
                        ctx.drawImage(image, x + inset, y + inset, layout.slot - inset * 2, layout.slot - inset * 2);
                    }
                }
            });
        };
        drawSlot(this.inventorySlots, layout.gridX, layout.gridY);
        drawSlot(this.hotbar, layout.hotbarX, layout.hotbarY);
        if (this.heldInventoryItem) {
            const image = this.iconFor(this.heldInventoryItem);
            if (image && (!("naturalWidth" in image) || (image.complete && image.naturalWidth))) {
                const x = this.lastMouseX - layout.slot / 2;
                const y = this.lastMouseY - layout.slot / 2;
                const inset = layout.slot * 0.15;
                ctx.drawImage(image, x + inset, y + inset, layout.slot - inset * 2, layout.slot - inset * 2);
            }
        }
    }

    private renderMenu(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        ctx.fillStyle = "rgba(5,10,12,.72)";
        ctx.fillRect(0, 0, width, height);
        const bindingMode = this.menu === "bindings";
        const boxW = Math.min(460, width - 40);
        const boxH = bindingMode ? 680 : this.menu === "settings" ? 540 : this.menu === "plugins" ? Math.min(620, height - 40) : this.menu === "pause" ? 476 : this.menu === "display" ? 480 : 410;
        const x = (width - boxW) / 2;
        const y = (height - boxH) / 2;
        ctx.fillStyle = "#13252d";
        ctx.fillRect(x, y, boxW, boxH);
        ctx.strokeStyle = "#e2bc68";
        ctx.strokeRect(x, y, boxW, boxH);
        ctx.fillStyle = "#f8f4e7";
        ctx.textAlign = "center";
        ctx.font = "700 30px 'LXGW WenKai', Manrope";
        const title = bindingMode ? t(language, "settings_keybindings") : this.menu === "settings" ? t(language, "settings_title") : this.menu === "display" ? t(language, "settings_display") : this.menu === "plugins" ? t(language, "plugins_title") : t(language, "pause_title");
        ctx.fillText(title, width / 2, y + 54);
        ctx.font = "14px 'LXGW WenKai', Manrope";
        if (bindingMode) {
            const bindings = Object.entries(settings.keyBindings) as [keyof KeyBindings, string][];
            bindings.forEach(([key, value], index) => {
                const by = y + 82 + index * 55;
                const selected = this.bindingCapture === key;
                ctx.fillStyle = selected ? "#6d5728" : "#28434a";
                ctx.fillRect(x + 32, by, boxW - 64, 42);
                ctx.fillStyle = "#e7eee5";
                ctx.textAlign = "left";
                ctx.fillText(t(language, `bind_${key}`), x + 46, by + 27);
                ctx.textAlign = "right";
                ctx.fillStyle = selected ? "#f5dc8e" : "#b9d2ca";
                const display = key === "mode" ? `${keyName(settings.keyBindings.debug)} + ${keyName(value)}` : keyName(value);
                ctx.fillText(selected ? t(language, "settings_rebind") : display, x + boxW - 46, by + 27);
            });
            const by = y + 82 + bindings.length * 55;
            ctx.fillStyle = "#28434a";
            ctx.fillRect(x + 32, by, boxW - 64, 42);
            ctx.textAlign = "center";
            ctx.fillStyle = "#e7eee5";
            ctx.fillText(t(language, "settings_back"), width / 2, by + 27);
        } else if (this.menu === "plugins") {
            if (!pluginReports.length) {
                ctx.fillStyle = "#b9d2ca";
                ctx.textAlign = "center";
                ctx.fillText(t(language, "plugins_none"), width / 2, y + 112);
            }
            pluginReports.slice(0, 4).forEach((report, index) => {
                const by = y + 78 + index * 108;
                const plugin = report.plugin;
                ctx.fillStyle = plugin ? "#28434a" : "#4c2b2b";
                ctx.fillRect(x + 28, by, boxW - 56, 94);
                ctx.textAlign = "left";
                ctx.font = "700 16px 'LXGW WenKai', Manrope";
                ctx.fillStyle = "#f8f4e7";
                ctx.fillText(plugin?.name || report.source.split("/").at(-1) || "plugin", x + 42, by + 24);
                ctx.textAlign = "right";
                ctx.fillStyle = plugin ? "#8de0a5" : "#f39494";
                ctx.fillText(plugin ? t(language, "plugins_loaded") : t(language, "plugins_failed"), x + boxW - 42, by + 24);
                ctx.textAlign = "left";
                ctx.font = "12px 'LXGW WenKai', Manrope";
                ctx.fillStyle = "#b9d2ca";
                const details = plugin
                    ? `${plugin.id}  |  ${t(language, "plugins_version")} ${plugin.version || "-"}  |  ${t(language, "plugins_authors")} ${(plugin.authors || []).join(", ") || "-"}`
                    : `${t(language, "plugins_source")}: ${report.source.split("/").at(-1)} | ${report.error || "Unknown error"}`;
                ctx.fillText(details.slice(0, 62), x + 42, by + 46);
                const description = plugin?.description || plugin?.website || `${t(language, "plugins_source")}: ${report.source.split("/").at(-1)}`;
                ctx.fillStyle = "#e7eee5";
                ctx.fillText(description.slice(0, 68), x + 42, by + 68);
                if (plugin?.website) {
                    ctx.fillStyle = "#e2bc68";
                    ctx.fillText(`${t(language, "plugins_website")}: ${plugin.website}`.slice(0, 68), x + 42, by + 86);
                }
            });
            const by = y + boxH - 72;
            ctx.fillStyle = "#28434a";
            ctx.fillRect(x + 52, by, boxW - 104, 44);
            ctx.textAlign = "center";
            ctx.fillStyle = "#e7eee5";
            ctx.fillText(t(language, "settings_back"), width / 2, by + 28);
        } else {
            const labels = this.menu === "settings"
                ? [
                    `${t(language, "settings_language")}: ${language === "zh" ? "中文" : "English"}`,
                    `${t(language, "settings_debug_default")}: ${this.debug ? text("开启", "ON") : text("关闭", "OFF")}`,
                    `${t(language, "settings_autosave")}: ${autosaveLabel(settings.autosaveInterval)}`,
                    `${t(language, "settings_cursor")}: ${settings.cursorStyle === "crosshair" ? t(language, "cursor_crosshair") : t(language, "cursor_default")}`,
                    t(language, "settings_display"),
                    t(language, "settings_keybindings"),
                    t(language, "settings_back"),
                ]
                : this.menu === "display"
                    ? [
                        `${t(language, "display_placement_alpha")}: ${Math.round(settings.placementAlpha * 100)}%`,
                        `${t(language, "display_placement_brightness")}: ${Math.round(settings.placementBrightness * 100)}%`,
                        `${t(language, "display_spectate_alpha")}: ${Math.round(settings.spectateAlpha * 100)}%`,
                        `${t(language, "display_spectate_brightness")}: ${Math.round(settings.spectateBrightness * 100)}%`,
                        `${t(language, "display_chat_font")}: ${settings.chatFontSize}px`,
                        t(language, "settings_back"),
                    ]
                    : [t(language, "pause_resume"), t(language, "settings_title"), t(language, "pause_plugins"), t(language, "pause_homepage")];
            labels.forEach((label, index) => {
                const by = y + 92 + index * 66;
                ctx.fillStyle = "#28434a";
                ctx.fillRect(x + 52, by, boxW - 104, 44);
                ctx.fillStyle = "#e7eee5";
                ctx.textAlign = "center";
                ctx.fillText(label, width / 2, by + 28);
            });
        }
        ctx.textAlign = "left";
    }
}

async function startGame(meta: WorldMeta): Promise<void> {
    const save = await storage.loadWorld(meta.id);
    new GameSession(meta, save);
}

app.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    if (action === "language") {
        toggleLanguage();
        renderLogin();
    } else if (action === "login" || action === "demo") {
        const input = document.querySelector<HTMLInputElement>("#username");
        const password = document.querySelector<HTMLInputElement>("#password");
        const candidate = action === "demo" ? "steve" : input?.value.trim() || "";
        if (!candidate) {
            renderLogin(text("请输入账号", "Please enter a username"));
            return;
        }
        if (action === "demo" && !window.confirm(text("确定使用默认账号 steve 登录吗？", "Log in with the demo account steve?"))) return;
        if (!(await storage.account(candidate, password?.value || "1234asdf", "login"))) {
            renderLogin(text("账号或密码错误", "Wrong username or password"));
            return;
        }
        username = candidate;
        storage.setUser(username);
        settings = await storage.loadSettings();
        language = settings.language;
        await renderWorlds();
    } else if (action === "register") {
        const input = document.querySelector<HTMLInputElement>("#username");
        const password = document.querySelector<HTMLInputElement>("#password");
        const candidate = input?.value.trim() || "";
        if (!candidate || !password?.value || password.value.length < 4 || !(await storage.account(candidate, password.value, "register"))) {
            renderLogin(text("注册失败：账号已存在或密码少于4位", "Registration failed: account exists or password is too short"));
            return;
        }
        renderLogin(text("注册成功，请登录", "Registered, please log in"));
    } else if (action === "logout") renderLogin(); else if (action === "plugins") renderPlugins(); else if (action === "plugins-rescan") {
        const count = await refreshPluginReports();
        renderPlugins(count ? text(`发现 ${count} 个新插件文件，请重新加载页面安装。`, `Found ${count} new plugin file(s). Reload the page to install.`) : text("未发现新的插件文件。", "No new plugin files found."));
    } else if (action === "plugins-reload") window.location.reload(); else if (action === "create-world") renderCreate(); else if (action === "worlds") void renderWorlds(); else if (action === "save-world") {
        const get = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)?.value || "";
        const seedInput = get("world-seed").trim();
        const numericSeed = Number(seedInput);
        const seed = seedInput === "" ? Math.floor(Math.random() * 0x7fffffff) : Number.isInteger(numericSeed) && numericSeed >= 0 && numericSeed <= 0xffffffff ? numericSeed : hashSeed(seedInput);
        const meta: WorldMeta = {
            id: crypto.randomUUID(),
            name: get("world-name").trim() || "New World",
            mode: (document.querySelector<HTMLSelectElement>("#world-mode")?.value || "spectator") as GameModeName,
            physics: {
                walkSpeed: Number(get("walk-speed")) || 1.8,
                flySpeed: Number(get("fly-speed")) || 3.5,
                jumpVelocity: Number(get("jump-velocity")) || 9.5,
                gravity: Number(get("gravity")) || 14
            },
            seed,
            createdAt: new Date().toISOString()
        };
        await storage.saveWorlds([...(await storage.loadWorlds(username)), meta], username);
        await startGame(meta);
    } else if (action.startsWith("enter:")) {
        const meta = (await storage.loadWorlds(username)).find((item) => item.id === action.slice(6));
        if (meta) await startGame(meta);
    } else if (action.startsWith("delete:")) {
        const id = action.slice(7);
        await storage.removeWorld(id, username);
        await storage.saveWorlds((await storage.loadWorlds(username)).filter((item) => item.id !== id), username);
        void renderWorlds();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.code === "KeyL") {
        event.preventDefault();
        event.stopPropagation();
        toggleLanguage();
        if (document.querySelector(".login-screen")) {
            const usernameInput = document.querySelector<HTMLInputElement>("#username")?.value;
            const passwordInput = document.querySelector<HTMLInputElement>("#password")?.value;
            renderLogin();
            const newUsername = document.querySelector<HTMLInputElement>("#username");
            const newPassword = document.querySelector<HTMLInputElement>("#password");
            if (newUsername) newUsername.value = usernameInput || "";
            if (newPassword && passwordInput) newPassword.value = passwordInput;
        } else if (document.querySelector(".world-screen")) void renderWorlds();
        else if (document.querySelector(".create-screen")) renderCreate();
    }
}, true);

async function boot(): Promise<void> {
    settings = await storage.loadSettings();
    language = settings.language;
    document.title = t(language, "window_title");
    await loadExternalPlugins();
    await loadHomepageBackground();
    renderLogin();
}

void boot();
