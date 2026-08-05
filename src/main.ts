import "./style.css";
import {type KeyState, Player} from "./core/player";
import {storage} from "./core/storage";
import {World} from "./core/world";
import type {GameModeName, KeyBindings, Language, WorldMeta} from "./core/types";
import {createMode} from "./modes";
import type {GameMode} from "./modes/base";
import {CreativeMode} from "./modes/creative";
import {type GamePlugin, type PluginGameContext, PluginRegistry} from "./plugins/api";
import {keyName, t} from "./i18n";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

let settings = storage.loadSettings();
let language: Language = settings.language;
let username = "steve";
const plugins = new PluginRegistry();

async function loadExternalPlugins(): Promise<void> {
    for (const url of storage.listPlugins()) {
        try {
            const module = await import(/* @vite-ignore */ url) as { default?: GamePlugin; plugin?: GamePlugin };
            const plugin = module.default || module.plugin;
            if (!plugin) throw new Error("Module must export default or plugin");
            plugins.use(plugin);
            storage.log("Plugin loaded", {id: plugin.id, version: plugin.version || "unspecified"});
        } catch (error) {
            console.error(`Failed to load plugin ${url}`, error);
            storage.log("Plugin load failed", {url, error: String(error)}, "error");
        }
    }
}

const text = (zh: string, en: string) => language === "zh" ? zh : en;
const shell = (content: string) => {
    app.innerHTML = `<div class="shell">${content}</div>`;
};
const button = (label: string, action: string, className = "") => `<button class="button ${className}" data-action="${action}">${label}</button>`;

function renderLogin(message = ""): void {
    shell(`<section class="login-screen"><div class="brand"><span>MY2D</span><strong>WORLD</strong><small>an endless block journal</small></div><div class="login-panel"><div class="eyebrow">LOCAL SESSION / 01</div><h1>${text("进入世界", "Enter your world")}</h1><p>${text("在浏览器中继续你的无限地形旅程。", "Continue your infinite terrain journey in the browser.")}</p><input id="username" value="steve" placeholder="${text("账号", "Username")}" /><input id="password" type="password" placeholder="${text("密码", "Password")}" /><div class="actions">${button(text("登录", "Login"), "login", "primary")}${button(text("注册", "Register"), "register")}</div><div class="login-tools"><button data-action="language">${language === "zh" ? "中文" : "English"}</button><button data-action="demo">${text("使用默认账号", "Use demo account")}</button></div><div class="message">${message}</div></div></section>`);
}

function renderWorlds(message = ""): void {
    const worlds = storage.loadWorlds(username);
    const rows = worlds.map((world) => `<div class="world-row"><div><b>${world.name}</b><span>${world.mode === "creative" ? text("创造模式", "Creative") : text("旁观模式", "Spectator")}</span></div>${button(text("进入", "Enter"), `enter:${world.id}`, "primary")}${button(text("删除", "Delete"), `delete:${world.id}`, "small")}</div>`).join("");
    shell(`<section class="world-screen"><header class="topbar"><div class="brand compact"><span>MY2D</span><strong>WORLD</strong></div><div class="top-actions"><span>${username}</span><button data-action="language">${language === "zh" ? "中" : "EN"}</button>${button(text("退出", "Log out"), "logout")}</div></header><div class="world-content"><div class="section-kicker">WORLD ARCHIVE / ${String(worlds.length).padStart(2, "0")}</div><h1>${text("我的世界", "My worlds")}</h1><p class="muted">${text("选择一个存档，或者从一片新的地平线开始。", "Choose a save, or start from a new horizon.")}</p><div class="world-list">${rows || `<div class="empty">${text("还没有世界。创建第一个世界。", "No worlds yet. Create your first one.")}</div>`}</div>${button(text("创建世界", "Create world"), "create-world", "primary create")}<div class="message">${message}</div></div></section>`);
}

function renderCreate(): void {
    const defaults = settings.movement;
    shell(`<section class="create-screen"><div class="create-card"><div class="section-kicker">NEW TERRITORY / 00${Math.floor(Math.random() * 9)}</div><h1>${text("创建世界", "Create world")}</h1><label>${text("世界名称", "World name")}<input id="world-name" value="新世界" maxlength="24" /></label><label>${text("游戏模式", "Game mode")}<select id="world-mode"><option value="spectator">${text("旁观模式", "Spectator")}</option><option value="creative">${text("创造模式", "Creative")}</option></select></label><div class="physics-grid"><label>${text("行走速度", "Walk speed")}<input id="walk-speed" type="number" step="0.1" value="${defaults.walkSpeed}" /></label><label>${text("飞行速度", "Fly speed")}<input id="fly-speed" type="number" step="0.1" value="${defaults.flySpeed}" /></label><label>${text("跳跃力度", "Jump power")}<input id="jump-velocity" type="number" step="0.1" value="${defaults.jumpVelocity}" /></label><label>${text("重力", "Gravity")}<input id="gravity" type="number" step="0.1" value="${defaults.gravity}" /></label></div><div class="actions">${button(text("开始探索", "Start exploring"), "save-world", "primary")}${button(text("取消", "Cancel"), "worlds")}</div></div></section>`);
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

class GameSession {
    readonly canvas = document.createElement("canvas");
    readonly ctx = this.canvas.getContext("2d")!;
    readonly world = new World();
    readonly player: Player;
    mode: GameMode;
    modeName: GameModeName;
    blockSize = 32;
    paused = false;
    debug = settings.debugDefault;
    private keys: KeyState = {left: false, right: false, up: false, down: false, jump: false};
    private mouseDown = false;
    private last = performance.now();
    private frame = 0;
    private autosaveElapsed = 0;
    private hotbar: Array<string | null> = ["grass_block_side", "dirt", "stone", "cobblestone", "mossy_cobblestone", "coal_block", "iron_block", "gold_block", "diamond_block"];
    private inventorySlots: Array<string | null> = ["diamond_block", "coal_ore", "iron_ore", "gold_ore", "diamond_ore", "emerald_ore", "lapis_ore", "redstone_ore", "copper_ore", "bedrock", "deepslate_coal_ore", "deepslate_iron_ore", "deepslate_gold_ore", "deepslate_diamond_ore", "deepslate_emerald_ore", "deepslate_lapis_ore", "deepslate_redstone_ore", "deepslate_copper_ore", "raw_iron_block", "raw_gold_block", "nether_quartz_ore", "nether_gold_ore", "iron_bars", "iron_chain", "mossy_cobblestone", "iron_block", "gold_block"];
    private selected = 0;
    private health = 20;
    private voidDamageTimer = 0;
    private notice = "";
    private noticeTimer = 0;
    private menu: "pause" | "settings" | "bindings" | null = null;
    private inventoryOpen = false;
    private heldInventoryItem: string | null = null;
    private bindingCapture: keyof KeyBindings | null = null;
    private readonly blockImages = new Map<string, HTMLImageElement>();
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
    private f3Held = false;
    private f4Held = false;

    constructor(readonly meta: WorldMeta) {
        this.modeName = meta.mode;
        const save = storage.loadWorld(meta.id);
        const x = save?.playerX ?? 0;
        const y = save?.playerY ?? this.world.getSurfaceHeight(0) + 0.001;
        this.world.updateView(x);
        this.world.restore(save?.brokenBlocks ?? [], save?.placedBlocks ?? []);
        plugins.notifyWorldCreated(this.world);
        this.player = new Player(x, y, meta.physics);
        if (save?.mode) this.modeName = save.mode;
        this.mode = createMode(this.modeName);
        [...new Set([...this.inventorySlots, ...this.hotbar, ...plugins.blocks.keys()].filter((type): type is string => type !== null))].forEach((type) => this.loadBlock(type));
        this.canvas.className = "game-canvas";
        this.ctx.imageSmoothingEnabled = false;
        document.body.innerHTML = "";
        document.body.appendChild(this.canvas);
        this.bindInput();
        this.resize();
        window.addEventListener("resize", this.resize);
        window.addEventListener("beforeunload", () => this.stop("browser-unload"));
        plugins.notifyGameStart(this.pluginContext());
        storage.log("Game started", {world: meta.name, worldId: meta.id, mode: this.modeName});
        requestAnimationFrame(this.tick);
    }

    private resize = (): void => {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    };

    private bindInput(): void {
        const actionFor = (code: string): keyof KeyBindings | null => (Object.entries(settings.keyBindings).find(([, value]) => value === code)?.[0] as keyof KeyBindings | undefined) || null;
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
            if (event.code === "KeyE" && this.modeName === "creative") {
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
            if (action === "debug") {
                this.f3Held = true;
                if (this.f4Held) this.toggleMode(); else this.debug = !this.debug;
            }
            if (action === "mode") {
                this.f4Held = true;
                if (this.f3Held) this.toggleMode();
            }
            if (event.key === "F11") {
                event.preventDefault();
                if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen();
            }
            if (event.key === "=" || event.key === "+") this.blockSize = Math.min(72, this.blockSize * 1.15);
            if (event.key === "-") this.blockSize = Math.max(16, this.blockSize / 1.15);
            if (/^Digit[1-9]$/.test(event.code)) this.selected = Math.min(this.hotbar.length - 1, Number(event.code.at(-1)) - 1);
            if (action === "chat") this.openChat();
            if (event.key === "/") this.openChat("/");
            if (action && ["left", "right", "up", "down", "jump"].includes(action)) {
                this.keys[action as keyof KeyState] = true;
                event.preventDefault();
            }
        });
        window.addEventListener("keyup", (event) => {
            const action = actionFor(event.code);
            if (action === "debug") this.f3Held = false;
            if (action === "mode") this.f4Held = false;
            if (action && ["left", "right", "up", "down", "jump"].includes(action)) this.keys[action as keyof KeyState] = false;
        });
        this.canvas.addEventListener("mousemove", (event) => {
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = event.clientX - rect.left;
            this.lastMouseY = event.clientY - rect.top;
        });
        this.canvas.addEventListener("mousedown", (event) => {
            if (this.chatOpen || this.inventoryOpen) {
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
                if (this.modeName === "spectator") {
                    this.dragging = true;
                    this.dragStartX = event.clientX;
                    this.dragStartY = event.clientY;
                    this.dragOriginX = this.cameraOffsetX;
                    this.dragOriginY = this.cameraOffsetY;
                } else this.place(event.clientX, event.clientY);
            }
        });
        this.canvas.addEventListener("mousemove", (event) => {
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = event.clientX - rect.left;
            this.lastMouseY = event.clientY - rect.top;
            if (this.dragging) {
                this.cameraOffsetX = this.dragOriginX - (event.clientX - this.dragStartX) / this.blockSize;
                this.cameraOffsetY = this.dragOriginY + (event.clientY - this.dragStartY) / this.blockSize;
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
                this.chatScroll = Math.max(0, Math.min(Math.max(0, this.chatMessages.length - 9), this.chatScroll + Math.sign(event.deltaY)));
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
        this.notice = text("已切换游戏模式", "Game mode switched");
        this.noticeTimer = 2;
        this.save();
        plugins.notifyGameModeChanged({...this.pluginContext(), previousMode, mode: this.modeName});
        storage.log("Game mode changed", {world: this.meta.name, from: previousMode, to: this.modeName});
    }

    private worldAtMouse(): [number, number] {
        const rect = this.canvas.getBoundingClientRect();
        return [this.player.x + this.cameraOffsetX + (this.lastMouseX - rect.width / 2) / this.blockSize, this.player.y + this.cameraOffsetY - (this.lastMouseY - rect.height / 2) / this.blockSize];
    }

    private hovered(): [number, number, string] | null {
        const [x, y] = this.worldAtMouse();
        const wx = Math.floor(x);
        const wy = Math.ceil(y);
        const type = this.world.getBlock(wx, wy);
        return type ? [wx, wy, type] : null;
    }

    private getPlacementTarget(): [number, number] | null {
        if (this.modeName !== "creative") return null;
        const [x, y] = this.worldAtMouse();
        const cellX = Math.floor(x);
        const cellY = Math.ceil(y);
        if (cellY < 1) return null;
        const hit = this.world.getBlock(cellX, cellY);
        if (!hit) return [cellX, cellY];
        const relX = x - (cellX + 0.5);
        const relY = y - (cellY - 0.5);
        const target: [number, number] = Math.abs(relX) > Math.abs(relY) ? [cellX + (relX >= 0 ? 1 : -1), cellY] : [cellX, cellY + (relY >= 0 ? 1 : -1)];
        return target[1] >= 1 ? target : null;
    }

    private lastMouseX = 0;
    private lastMouseY = 0;
    private chatOpen = false;
    private chatText = "";
    private chatMessages: Array<{ text: string; age: number }> = [];
    private chatHistory: string[] = [];
    private chatHistoryCursor: number | null = null;
    private chatScroll = 0;
    private suggestionIndex = 0;
    private suggestions: string[] = [];

    private openChat(initial = ""): void {
        this.chatOpen = true;
        this.chatText = initial;
        this.chatScroll = 0;
        this.suggestionIndex = 0;
        this.suggestions = [];
        this.chatHistoryCursor = null;
        this.paused = false;
        this.menu = null;
    }

    private handleChatKey(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.chatOpen = false;
            this.chatText = "";
            this.chatScroll = 0;
        } else if (event.key === "Backspace") {
            this.chatText = this.chatText.slice(0, -1);
            this.resetSuggestions();
        } else if (event.key === "Tab") {
            const suggestions = this.suggestions.length ? this.suggestions : this.getSuggestions();
            if (suggestions.length) {
                const suggestion = suggestions[this.suggestionIndex % suggestions.length];
                this.suggestionIndex += 1;
                this.suggestions = suggestions;
                if (suggestion.startsWith("/")) {
                    this.chatText = suggestion + (["/gamemode", "/debug"].includes(suggestion) ? " " : "");
                    this.resetSuggestions();
                } else {
                    const prefix = this.chatText.includes(" ") ? this.chatText.slice(0, this.chatText.lastIndexOf(" ")) : this.chatText;
                    this.chatText = `${prefix} ${suggestion}`;
                }
            }
        } else if (event.key === "Enter") {
            const input = this.chatText.trim();
            if (input) {
                this.chatHistory.push(input);
                this.chatHistory = this.chatHistory.slice(-200);
                this.submitChat(input);
            }
            this.chatOpen = false;
            this.chatText = "";
            this.chatHistoryCursor = null;
        } else if (event.key === "ArrowUp") {
            if (this.chatHistory.length) {
                this.chatHistoryCursor = this.chatHistoryCursor === null ? this.chatHistory.length - 1 : Math.max(0, this.chatHistoryCursor - 1);
                this.chatText = this.chatHistory[this.chatHistoryCursor];
                this.resetSuggestions();
            }
        } else if (event.key === "ArrowDown") {
            if (this.chatHistoryCursor !== null) {
                this.chatHistoryCursor += 1;
                if (this.chatHistoryCursor >= this.chatHistory.length) {
                    this.chatHistoryCursor = null;
                    this.chatText = "";
                } else this.chatText = this.chatHistory[this.chatHistoryCursor];
                this.resetSuggestions();
            }
        } else if (event.key.length === 1 && this.chatText.length < 160) {
            this.chatText += event.key;
            this.resetSuggestions();
        }
        event.preventDefault();
    }

    private submitChat(input: string): void {
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
            const worlds = storage.loadWorlds(username).map((world) => world.id === this.meta.id ? this.meta : world);
            storage.saveWorlds(worlds, username);
            this.save();
            storage.log("Movement speed changed", {world: this.meta.name, speed});
            this.addChat(`Movement speed set to ${speed}`);
        } else if (command === "debug" && ["on", "off", "true", "false"].includes(parts[1])) {
            this.debug = parts[1] === "on" || parts[1] === "true";
            settings.debugDefault = this.debug;
            storage.saveSettings(settings);
            this.addChat(`Debug ${this.debug ? "on" : "off"}`);
        } else this.addChat("Unknown or invalid command");
    }

    private addChat(text: string): void {
        this.chatMessages.push({text, age: 0});
        this.chatMessages = this.chatMessages.slice(-200);
        this.chatScroll = 0;
    }

    private getSuggestions(): string[] {
        if (!this.chatText.startsWith("/")) return [];
        const body = this.chatText.slice(1);
        const parts = body.split(/\s+/);
        const trailing = body.endsWith(" ");
        const commands = ["gamemode", "speed", "movespeed", "debug"];
        if (!parts[0]) return commands.map((command) => `/${command}`);
        if (parts.length === 1 && !trailing) return commands.filter((command) => command.startsWith(parts[0].toLowerCase())).map((command) => `/${command}`);
        const args: Record<string, string[]> = {
            gamemode: ["creative", "spectator"],
            debug: ["on", "off", "true", "false"]
        };
        const prefix = trailing ? "" : parts.at(-1)?.toLowerCase() || "";
        return (args[parts[0].toLowerCase()] || []).filter((argument) => argument.startsWith(prefix));
    }

    private resetSuggestions(): void {
        this.suggestionIndex = 0;
        this.suggestions = [];
    }

    private snapBlockSize(size: number): number {
        return Math.max(16, Math.min(72, Math.round(size)));
    }

    private toggleInventory(): void {
        if (this.modeName !== "creative" || this.menu) return;
        if (this.inventoryOpen && this.heldInventoryItem) {
            const openSlot = this.inventorySlots.findIndex((item) => item === null);
            if (openSlot >= 0) this.inventorySlots[openSlot] = this.heldInventoryItem;
            else this.hotbar[this.selected] = this.heldInventoryItem;
            this.heldInventoryItem = null;
        }
        this.inventoryOpen = !this.inventoryOpen;
        this.mouseDown = false;
        this.dragging = false;
        storage.log(this.inventoryOpen ? "Creative inventory opened" : "Creative inventory closed", {world: this.meta.name});
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

    private inventoryLayout(): {
        x: number;
        y: number;
        width: number;
        scale: number;
        slot: number;
        gridX: number;
        gridY: number;
        hotbarX: number;
        hotbarY: number
    } {
        const width = Math.min(768, window.innerWidth - 32);
        const scale = width / 512;
        const height = width;
        const slot = CREATIVE_INVENTORY_GUI.slotSize * scale;
        const x = (window.innerWidth - width) / 2 + CREATIVE_INVENTORY_GUI.panelOffsetX * scale;
        const y = (window.innerHeight - height) / 2 + CREATIVE_INVENTORY_GUI.panelOffsetY * scale;
        return {
            x,
            y,
            width,
            scale,
            slot,
            gridX: x + CREATIVE_INVENTORY_GUI.gridOffsetX * scale,
            gridY: y + CREATIVE_INVENTORY_GUI.gridOffsetY * scale,
            hotbarX: x + CREATIVE_INVENTORY_GUI.hotbarOffsetX * scale,
            hotbarY: y + CREATIVE_INVENTORY_GUI.hotbarOffsetY * scale
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
        if (this.noticeTimer > 0) this.noticeTimer -= dt;
        if (!this.paused && !this.chatOpen) {
            this.mode.update({
                player: this.player,
                world: this.world,
                keys: this.keys,
                mouseDown: this.mouseDown,
                hovered: this.hovered(),
                blockSize: this.blockSize,
                dt,
                textures: this.blockImages,
                onBlockBroken: (x, y, type) => {
                    plugins.notifyBlockBroken({...this.pluginContext(), x, y, type});
                    storage.log("Block broken", {world: this.meta.name, x, y, type});
                }
            });
            this.world.updateView(this.player.x);
            this.updateVoid(dt);
            plugins.notifyGameTick({...this.pluginContext(), dt});
            this.autosaveElapsed += dt;
            if (this.autosaveElapsed >= 10) {
                this.save();
                this.autosaveElapsed = 0;
            }
        }
        this.render();
        requestAnimationFrame(this.tick);
    };

    private updateVoid(dt: number): void {
        if (this.modeName !== "creative" || this.player.y >= -10) {
            this.voidDamageTimer = 0;
            return;
        }
        this.voidDamageTimer += dt;
        this.health = Math.max(0, this.health - 20 * dt);
        if (this.health <= 0) {
            const spawnY = this.world.getSurfaceHeight(0) + 0.001;
            this.player.reset(0, spawnY);
            this.health = 20;
            this.notice = text("你掉入虚空并重生了", "You fell into the void and respawned");
            this.noticeTimer = 3;
            plugins.notifyPlayerRespawn(this.pluginContext());
            storage.log("Player respawned", {world: this.meta.name, reason: "void"});
        }
    }

    private loadBlock(type: string): void {
        const image = new Image();
        image.src = `/assets/block/${type}.png`;
        this.blockImages.set(type, image);
    }

    private loadImage(src: string): HTMLImageElement {
        const image = new Image();
        image.src = src;
        return image;
    }

    private handleMenuClick(clientX: number, clientY: number): void {
        const boxW = Math.min(420, window.innerWidth - 40);
        const x = (window.innerWidth - boxW) / 2;
        const menuHeight = this.menu === "bindings" ? 620 : 410;
        const y = (window.innerHeight - menuHeight) / 2;
        if (clientX < x + 52 || clientX > x + boxW - 52) return;
        const index = Math.floor((clientY - (y + (this.menu === "bindings" ? 82 : 92))) / (this.menu === "bindings" ? 55 : 66));
        if (index < 0 || index > (this.menu === "bindings" ? 8 : this.menu === "settings" ? 3 : 2)) return;
        if (this.menu === "pause") {
            if (index === 0) {
                this.menu = null;
                this.paused = false;
                plugins.notifyGameResume(this.pluginContext());
                storage.log("Game resumed", {world: this.meta.name});
            }
            if (index === 1) this.menu = "settings";
            if (index === 2) {
                this.stop("world-list");
                app!.innerHTML = "";
                document.body.innerHTML = "";
                document.body.appendChild(app!);
                renderWorlds();
            }
            return;
        }
        if (this.menu === "settings") {
            if (index === 0) {
                language = language === "zh" ? "en" : "zh";
                settings.language = language;
                storage.saveSettings(settings);
            }
            if (index === 1) {
                this.debug = !this.debug;
                settings.debugDefault = this.debug;
                storage.saveSettings(settings);
            }
            if (index === 2) this.menu = "bindings";
            if (index === 3) this.menu = "pause";
            return;
        }
        if (index === 8) {
            this.menu = "settings";
            return;
        }
        const key = Object.keys(settings.keyBindings)[index] as keyof KeyBindings;
        if (key) this.bindingCapture = key;
    }

    private pluginContext(): PluginGameContext {
        return {username, meta: this.meta, world: this.world, player: this.player, mode: this.modeName};
    }

    private stop(reason: string): void {
        if (!this.active) return;
        this.save();
        plugins.notifyGameStop({...this.pluginContext(), reason});
        storage.log("Game stopped", {world: this.meta.name, reason});
        this.active = false;
    }

    private save = (): void => {
        storage.saveWorld(this.meta.id, {
            playerX: this.player.x,
            playerY: this.player.y,
            mode: this.modeName,
            brokenBlocks: [...this.world.brokenBlocks].map(World.parseCell),
            placedBlocks: [...this.world.placedBlocks].map(([cell, type]) => {
                const [x, y] = World.parseCell(cell);
                return [x, y, type] as [number, number, string];
            }),
        });
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
        const bottom = Math.max(1, Math.floor(cameraY - height / this.blockSize / 2 - 1));
        const top = Math.ceil(cameraY + height / this.blockSize / 2 + 1);
        for (const [chunkX, chunk] of this.world.chunks) {
            if (chunkX * 16 > right || (chunkX + 1) * 16 < left) continue;
            for (let x = Math.max(left, chunk.start); x < Math.min(right, chunk.start + 16); x += 1) for (let y = bottom; y <= Math.min(top, chunk.surfaces.get(x) ?? 0); y += 1) {
                const type = this.world.getBlock(x, y);
                if (!type) continue;
                const sx = Math.round((x - cameraX) * this.blockSize + width / 2);
                const sy = Math.round((cameraY - y) * this.blockSize + height / 2);
                const image = this.blockImages.get(type);
                if (image?.complete && image.naturalWidth) ctx.drawImage(image, sx, sy, this.blockSize, this.blockSize); else {
                    const palette: Record<string, string> = {
                        grass_block_side: "#62a941",
                        dirt: "#8d613c",
                        stone: "#777d82",
                        cobblestone: "#626b6d",
                        mossy_cobblestone: "#4c7564",
                        bedrock: "#303940"
                    };
                    ctx.fillStyle = palette[type] ?? "#cc39b7";
                    ctx.fillRect(sx, sy, this.blockSize, this.blockSize);
                }
            }
        }
        for (const [cell, type] of this.world.placedBlocks) {
            const [x, y] = World.parseCell(cell);
            if (x < left || x > right || y < bottom || y > top) continue;
            const sx = Math.round((x - cameraX) * this.blockSize + width / 2);
            const sy = Math.round((cameraY - y) * this.blockSize + height / 2);
            const image = type ? this.blockImages.get(type) : undefined;
            if (image?.complete && image.naturalWidth) ctx.drawImage(image, sx, sy, this.blockSize, this.blockSize); else {
                ctx.fillStyle = "#cc39b7";
                ctx.fillRect(sx, sy, this.blockSize, this.blockSize);
            }
        }
        const target = this.hovered();
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
            ctx.fillStyle = "rgba(255,255,255,.25)";
            ctx.fillRect(sx, sy, this.blockSize, this.blockSize);
            ctx.strokeStyle = "rgba(255,255,255,.95)";
            ctx.strokeRect(sx + 1, sy + 1, this.blockSize - 2, this.blockSize - 2);
        }
        if (this.mode instanceof CreativeMode) this.mode.particles.render(ctx, cameraX, cameraY, this.blockSize);
        this.mode.renderPlayer(ctx, {
            player: this.player,
            world: this.world,
            keys: this.keys,
            mouseDown: this.mouseDown,
            hovered: this.hovered(),
            blockSize: this.blockSize,
            dt: 0,
            textures: this.blockImages
        }, cameraX, cameraY);
        this.renderHud(ctx, width, height);
    }

    private renderHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        ctx.fillStyle = "rgba(9,17,24,.78)";
        ctx.fillRect(18, 18, 184, 76);
        ctx.fillStyle = "#f8f4e7";
        ctx.font = "600 14px ui-monospace";
        ctx.fillText(this.meta.name.toUpperCase(), 32, 43);
        ctx.fillStyle = "#9bb3b3";
        ctx.fillText(this.modeName === "creative" ? text("创造模式", "CREATIVE") : text("旁观模式", "SPECTATOR"), 32, 66);
        ctx.fillText("[ESC] " + text("暂停", "PAUSE"), 32, 86);
        ctx.fillStyle = "#d95f55";
        ctx.fillRect(18, 106, 184 * (this.health / 20), 6);
        ctx.strokeStyle = "#e7eee5";
        ctx.strokeRect(18, 106, 184, 6);
        const slot = 48;
        const barWidth = slot * this.hotbar.length;
        ctx.fillStyle = "rgba(9,17,24,.88)";
        ctx.fillRect((width - barWidth) / 2 - 8, height - 68, barWidth + 16, 56);
        this.hotbar.forEach((type, index) => {
            const x = (width - barWidth) / 2 + index * slot;
            ctx.strokeStyle = index === this.selected ? "#f2d67b" : "#52666a";
            ctx.lineWidth = index === this.selected ? 3 : 1;
            ctx.strokeRect(x, height - 60, 42, 42);
            const image = type ? this.blockImages.get(type) : undefined;
            if (image?.complete && image.naturalWidth) ctx.drawImage(image, x + 7, height - 53, 28, 28);
        });
        if (this.debug) {
            ctx.fillStyle = "#102229";
            ctx.fillRect(18, 124, 370, 224);
            ctx.fillStyle = "#d8e4df";
            ctx.font = "12px ui-monospace";
            const target = this.hovered();
            const lines = [`FPS ${Math.round(1000 / 16)}`, `MODE ${this.modeName}`, `WORLD ${this.meta.name}`, `PLAYER ${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}`, `VELOCITY ${this.player.velocityX.toFixed(2)}, ${this.player.velocityY.toFixed(2)}`, `CAMERA ${(this.player.x + this.cameraOffsetX).toFixed(1)}, ${(this.player.y + this.cameraOffsetY).toFixed(1)}`, `MOUSE ${this.lastMouseX}, ${this.lastMouseY}`, `BLOCK ${target ? `${target[0]}, ${target[1]} ${target[2]}` : "air"}`, `ZOOM ${Math.round(this.blockSize / 32 * 100)}%`, `CHUNKS ${this.world.chunks.size}`, `TEXTURES ${this.blockImages.size}`, `HEALTH ${Math.ceil(this.health)}/20`, `CONTROLS ${Object.values(settings.keyBindings).map(keyName).join(" / ")}`];
            lines.forEach((line, index) => ctx.fillText(line, 30, 147 + index * 16));
        }
        const messages = this.chatOpen ? this.chatMessages : this.chatMessages.filter((message) => message.age < 7);
        const end = messages.length - (this.chatOpen ? this.chatScroll : 0);
        const visible = messages.slice(Math.max(0, end - 9), end);
        ctx.font = "13px ui-monospace";
        visible.forEach((message, index) => {
            ctx.globalAlpha = this.chatOpen ? 1 : Math.max(0, Math.min(1, (7 - message.age) / 3));
            const y = height - (this.chatOpen ? 54 : 18) - (visible.length - index) * 22;
            ctx.fillStyle = "rgba(0,0,0,.6)";
            ctx.fillRect(14, y, Math.min(width - 28, 600), 20);
            ctx.fillStyle = "#fff";
            ctx.fillText(message.text, 22, y + 14);
        });
        ctx.globalAlpha = 1;
        if (this.chatOpen) {
            const suggestions = this.getSuggestions();
            if (suggestions.length) {
                ctx.fillStyle = "rgba(0,0,0,.78)";
                ctx.fillRect(14, height - 70, width - 28, 24);
                ctx.fillStyle = "#d2d9d5";
                ctx.fillText(suggestions.join("  "), 24, height - 54);
            }
            ctx.fillStyle = "rgba(0,0,0,.88)";
            ctx.fillRect(14, height - 40, width - 28, 30);
            ctx.strokeStyle = "#d8e4df";
            ctx.strokeRect(14, height - 40, width - 28, 30);
            ctx.fillStyle = "#fff";
            ctx.fillText(this.chatText, 24, height - 20);
        }
        if (this.noticeTimer > 0) {
            ctx.textAlign = "center";
            ctx.fillStyle = "#f5dc8e";
            ctx.font = "600 16px Manrope";
            ctx.fillText(this.notice, width / 2, 42);
            ctx.textAlign = "left";
        }
        if (this.inventoryOpen) this.renderInventory(ctx);
        else if (this.paused) this.renderMenu(ctx, width, height);
    }

    private renderInventory(ctx: CanvasRenderingContext2D): void {
        const layout = this.inventoryLayout();
        ctx.fillStyle = "rgba(0, 0, 0, .58)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (this.inventoryBackground.complete && this.inventoryBackground.naturalWidth) {
            ctx.drawImage(this.inventoryBackground, layout.x, layout.y, layout.width, layout.width);
        } else {
            ctx.fillStyle = "#c6c6c6";
            ctx.fillRect(layout.x, layout.y, layout.width, layout.width);
        }
        const drawSlot = (type: string | null | undefined, x: number, y: number, selected = false): void => {
            ctx.fillStyle = selected ? "rgba(255, 255, 255, .32)" : "rgba(0, 0, 0, .14)";
            ctx.fillRect(x, y, layout.slot, layout.slot);
            if (selected) {
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, layout.slot - 2, layout.slot - 2);
            }
            if (!type) return;
            const image = this.blockImages.get(type);
            if (image?.complete && image.naturalWidth) ctx.drawImage(image, x + layout.slot * .14, y + layout.slot * .14, layout.slot * .72, layout.slot * .72);
        };
        this.inventorySlots.forEach((type, index) => {
            const column = index % 9;
            const row = Math.floor(index / 9);
            drawSlot(type, layout.gridX + column * layout.slot, layout.gridY + row * layout.slot);
        });
        this.hotbar.forEach((type, index) => drawSlot(type, layout.hotbarX + index * layout.slot, layout.hotbarY, index === this.selected));
        if (this.heldInventoryItem) {
            const image = this.blockImages.get(this.heldInventoryItem);
            const x = this.lastMouseX + CREATIVE_INVENTORY_GUI.heldItemOffsetX * layout.scale - layout.slot * .36;
            const y = this.lastMouseY + CREATIVE_INVENTORY_GUI.heldItemOffsetY * layout.scale - layout.slot * .36;
            ctx.globalAlpha = .9;
            if (image?.complete && image.naturalWidth) ctx.drawImage(image, x, y, layout.slot * .72, layout.slot * .72);
            else {
                ctx.fillStyle = "#cc39b7";
                ctx.fillRect(x, y, layout.slot * .72, layout.slot * .72);
            }
            ctx.globalAlpha = 1;
        }
    }

    private renderMenu(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        ctx.fillStyle = "rgba(5,10,12,.72)";
        ctx.fillRect(0, 0, width, height);
        const bindingMode = this.menu === "bindings";
        const boxW = Math.min(460, width - 40);
        const boxH = bindingMode ? 620 : 410;
        const x = (width - boxW) / 2;
        const y = (height - boxH) / 2;
        ctx.fillStyle = "#13252d";
        ctx.fillRect(x, y, boxW, boxH);
        ctx.strokeStyle = "#e2bc68";
        ctx.strokeRect(x, y, boxW, boxH);
        ctx.fillStyle = "#f8f4e7";
        ctx.textAlign = "center";
        ctx.font = "700 30px Georgia";
        const title = bindingMode ? t(language, "settings_keybindings") : this.menu === "settings" ? t(language, "settings_title") : t(language, "pause_title");
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
                ctx.fillText(selected ? t(language, "settings_rebind") : keyName(value), x + boxW - 46, by + 27);
            });
            const by = y + 82 + bindings.length * 55;
            ctx.fillStyle = "#28434a";
            ctx.fillRect(x + 32, by, boxW - 64, 42);
            ctx.textAlign = "center";
            ctx.fillStyle = "#e7eee5";
            ctx.fillText(t(language, "settings_back"), width / 2, by + 27);
        } else {
            const labels = this.menu === "settings"
                ? [`${t(language, "settings_language")}: ${language === "zh" ? "中文" : "English"}`, `${t(language, "settings_debug_default")}: ${this.debug ? text("开启", "ON") : text("关闭", "OFF")}`, t(language, "settings_keybindings"), t(language, "settings_back")]
                : [t(language, "pause_resume"), t(language, "settings_title"), t(language, "pause_homepage")];
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

function startGame(meta: WorldMeta): void {
    new GameSession(meta);
}

app.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    if (action === "language") {
        language = language === "zh" ? "en" : "zh";
        settings.language = language;
        storage.saveSettings(settings);
        renderLogin();
    } else if (action === "login" || action === "demo") {
        const input = document.querySelector<HTMLInputElement>("#username");
        const password = document.querySelector<HTMLInputElement>("#password");
        const candidate = input?.value.trim() || "steve";
        if (!storage.account(candidate, password?.value || "1234asdf", "login")) {
            renderLogin(text("账号或密码错误", "Wrong username or password"));
            return;
        }
        username = candidate;
        storage.setUser(username);
        settings = storage.loadSettings();
        language = settings.language;
        renderWorlds();
    } else if (action === "register") {
        const input = document.querySelector<HTMLInputElement>("#username");
        const password = document.querySelector<HTMLInputElement>("#password");
        const candidate = input?.value.trim() || "";
        if (!candidate || !password?.value || password.value.length < 4 || !storage.account(candidate, password.value, "register")) {
            renderLogin(text("注册失败：账号已存在或密码少于4位", "Registration failed: account exists or password is too short"));
            return;
        }
        renderLogin(text("注册成功，请登录", "Registered, please log in"));
    } else if (action === "logout") renderLogin(); else if (action === "create-world") renderCreate(); else if (action === "worlds") renderWorlds(); else if (action === "save-world") {
        const get = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)?.value || "";
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
            createdAt: new Date().toISOString()
        };
        storage.saveWorlds([...storage.loadWorlds(username), meta], username);
        startGame(meta);
    } else if (action.startsWith("enter:")) {
        const meta = storage.loadWorlds(username).find((item) => item.id === action.slice(6));
        if (meta) startGame(meta);
    } else if (action.startsWith("delete:")) {
        const id = action.slice(7);
        storage.removeWorld(id, username);
        storage.saveWorlds(storage.loadWorlds(username).filter((item) => item.id !== id), username);
        renderWorlds();
    }
});

void loadExternalPlugins().finally(() => renderLogin());
