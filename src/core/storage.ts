import {DEFAULT_SETTINGS, type PlayerSettings, type WorldMeta, type WorldSave} from "./types";

let activeUser = "steve";

function request<T>(url: string, method = "GET", value?: unknown): T {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, false);
    xhr.setRequestHeader("Content-Type", "application/json");
    try {
        xhr.send(value === undefined ? undefined : JSON.stringify(value));
    } catch {
        return null as T;
    }
    if (xhr.status < 200 || xhr.status >= 300) return null as T;
    try {
        return xhr.responseText ? JSON.parse(xhr.responseText) as T : (null as T);
    } catch {
        return null as T;
    }
}

export const storage = {
    setUser(username: string): void {
        activeUser = username || "steve";
    },
    account(username: string, password: string, action: "login" | "register"): boolean {
        return Boolean(request<{ ok?: boolean }>("/api/account", "POST", {username, password, action})?.ok);
    },
    loadSettings(): PlayerSettings {
        const saved = request<Partial<PlayerSettings>>(`/api/settings?user=${encodeURIComponent(activeUser)}`) || {};
        return {
            ...DEFAULT_SETTINGS,
            ...saved,
            keyBindings: {...DEFAULT_SETTINGS.keyBindings, ...saved.keyBindings},
            movement: {...DEFAULT_SETTINGS.movement, ...saved.movement},
        };
    },
    saveSettings(settings: PlayerSettings): void {
        request(`/api/settings?user=${encodeURIComponent(activeUser)}`, "POST", settings);
    },
    loadWorlds(username = "steve"): WorldMeta[] {
        return request<{
            worlds?: WorldMeta[]
        }>(`/api/worlds?user=${encodeURIComponent(username || activeUser)}`)?.worlds || [];
    },
    saveWorlds(worlds: WorldMeta[], username = "steve"): void {
        request(`/api/worlds?user=${encodeURIComponent(username || activeUser)}`, "POST", {worlds});
    },
    loadWorld(id: string, username = "steve"): WorldSave | null {
        return request<WorldSave | null>(`/api/world-save?user=${encodeURIComponent(username || activeUser)}&world=${encodeURIComponent(id)}`);
    },
    saveWorld(id: string, save: WorldSave, username = "steve"): void {
        request(`/api/world-save?user=${encodeURIComponent(username || activeUser)}&world=${encodeURIComponent(id)}`, "POST", save);
    },
    removeWorld(id: string, username = "steve"): void {
        request(`/api/world-save?user=${encodeURIComponent(username || activeUser)}&world=${encodeURIComponent(id)}`, "DELETE");
    },
    log(event: string, details: Record<string, unknown> = {}, level: "info" | "warn" | "error" = "info"): void {
        request(`/api/log?user=${encodeURIComponent(activeUser)}`, "POST", {event, details, level});
    },
    listPlugins(): string[] {
        return request<{ plugins?: string[] }>("/api/plugins")?.plugins || [];
    },
};
