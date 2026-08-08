import {DEFAULT_SETTINGS, type PlayerSettings, type WorldMeta, type WorldSave} from "./types";

let activeUser = "steve";

export interface PluginPackage {
    id: string;
    name: string;
    version?: string;
    entry: string;
}

async function request<T>(url: string, method = "GET", value?: unknown): Promise<T | null> {
    try {
        const response = await fetch(url, {
            method,
            headers: {"Content-Type": "application/json"},
            body: value === undefined ? undefined : JSON.stringify(value),
        });
        if (!response.ok) return null;
        const text = await response.text();
        return text ? JSON.parse(text) as T : (null as T);
    } catch {
        return null;
    }
}

export const storage = {
    setUser(username: string): void {
        activeUser = username || "steve";
    },
    async account(username: string, password: string, action: "login" | "register"): Promise<boolean> {
        return Boolean((await request<{ ok?: boolean }>("/api/account", "POST", {username, password, action}))?.ok);
    },
    async loadSettings(): Promise<PlayerSettings> {
        const saved = (await request<Partial<PlayerSettings>>(`/api/settings?user=${encodeURIComponent(activeUser)}`)) || {};
        return {
            ...DEFAULT_SETTINGS,
            ...saved,
            keyBindings: {...DEFAULT_SETTINGS.keyBindings, ...saved.keyBindings},
            movement: {...DEFAULT_SETTINGS.movement, ...saved.movement},
            autosaveInterval: typeof saved.autosaveInterval === "number" && saved.autosaveInterval >= 0 ? saved.autosaveInterval : DEFAULT_SETTINGS.autosaveInterval,
            cursorStyle: saved.cursorStyle === "crosshair" || saved.cursorStyle === "default" ? saved.cursorStyle : DEFAULT_SETTINGS.cursorStyle,
            placementAlpha: typeof saved.placementAlpha === "number" && saved.placementAlpha >= 0 && saved.placementAlpha <= 1 ? saved.placementAlpha : DEFAULT_SETTINGS.placementAlpha,
            placementBrightness: typeof saved.placementBrightness === "number" && saved.placementBrightness >= 0 && saved.placementBrightness <= 1 ? saved.placementBrightness : DEFAULT_SETTINGS.placementBrightness,
            spectateAlpha: typeof saved.spectateAlpha === "number" && saved.spectateAlpha >= 0 && saved.spectateAlpha <= 1 ? saved.spectateAlpha : DEFAULT_SETTINGS.spectateAlpha,
            spectateBrightness: typeof saved.spectateBrightness === "number" && saved.spectateBrightness >= 0 && saved.spectateBrightness <= 1 ? saved.spectateBrightness : DEFAULT_SETTINGS.spectateBrightness,
        };
    },
    async saveSettings(settings: PlayerSettings): Promise<boolean> {
        return Boolean(await request(`/api/settings?user=${encodeURIComponent(activeUser)}`, "POST", settings));
    },
    async loadWorlds(username = "steve"): Promise<WorldMeta[]> {
        return (await request<{
            worlds?: WorldMeta[]
        }>(`/api/worlds?user=${encodeURIComponent(username || activeUser)}`))?.worlds || [];
    },
    async saveWorlds(worlds: WorldMeta[], username = "steve"): Promise<boolean> {
        return Boolean(await request(`/api/worlds?user=${encodeURIComponent(username || activeUser)}`, "POST", {worlds}));
    },
    async loadWorld(id: string, username = "steve"): Promise<WorldSave | null> {
        return request<WorldSave | null>(`/api/world-save?user=${encodeURIComponent(username || activeUser)}&world=${encodeURIComponent(id)}`);
    },
    async saveWorld(id: string, save: WorldSave, username = "steve"): Promise<boolean> {
        return Boolean(await request(`/api/world-save?user=${encodeURIComponent(username || activeUser)}&world=${encodeURIComponent(id)}`, "POST", save));
    },
    async removeWorld(id: string, username = "steve"): Promise<boolean> {
        return Boolean(await request(`/api/world-save?user=${encodeURIComponent(username || activeUser)}&world=${encodeURIComponent(id)}`, "DELETE"));
    },
    async log(event: string, details: Record<string, unknown> = {}, level: "info" | "warn" | "error" = "info"): Promise<boolean> {
        return Boolean(await request(`/api/log?user=${encodeURIComponent(activeUser)}`, "POST", {
            event,
            details,
            level
        }));
    },
    async listPlugins(): Promise<PluginPackage[]> {
        return (await request<{ plugins?: PluginPackage[] }>("/api/plugins"))?.plugins || [];
    },
};
