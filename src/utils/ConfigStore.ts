// utils/ConfigStore.ts

import { logInfo, logError } from "./Logger";

export const CONFIG_DIR = "/storage/emulated/0/Download/Operit/subagent/";
export const CONFIG_FILE = CONFIG_DIR + "config.json";

/** 模板（名片）：id 即 name（映射名或角色卡名） */
export interface FriendTemplate {
    name: string;      // 显示名（映射名优先，否则卡名）
    cardId: string;    // 角色卡 id（可空=纯名片）
    cardName: string;  // 角色卡原名
}

/** 实例（好友会话） */
export interface FriendInstance {
    id: string;        // 内部唯一 id
    name: string;      // 显示名（走映射）
    cardId: string;
    cardName: string;
    chatId: string;    // 对应 Operit 会话 id
    disabled: boolean; // 禁用则不出现在 list
    isSelf: boolean;   // 是否"自己"
}

export interface AccountEntry {
    templates: FriendTemplate[];
    instances: FriendInstance[];
}

export interface SubAgentConfig {
    version: number;
    aliases: { [original: string]: string };
    /** 集合：允许进入市场/被添加的角色卡「原名」白名单（全局）；空=不限制 */
    collection: string[];
    accounts: { [chatId: string]: AccountEntry };
}

function freshConfig(): SubAgentConfig {
    return { version: 3, aliases: {}, collection: [], accounts: {} };
}

function readText(path: string): string | null {
    try {
        const File = Java.type("java.io.File");
        const FileReader = Java.type("java.io.FileReader");
        const BufferedReader = Java.type("java.io.BufferedReader");
        const file = new File(path);
        if (!file.exists()) return null;
        const reader = new BufferedReader(new FileReader(file));
        let content = "";
        let line;
        while ((line = reader.readLine()) !== null) {
            content += line + "\n";
        }
        reader.close();
        return content.trim();
    } catch (e) {
        logError("读取配置失败: " + (e as any).message);
        return null;
    }
}

function writeText(path: string, content: string): boolean {
    try {
        const File = Java.type("java.io.File");
        const FileWriter = Java.type("java.io.FileWriter");
        const file = new File(path);
        const parent = file.getParentFile();
        if (parent && !parent.exists()) parent.mkdirs();
        const writer = new FileWriter(file, false);
        writer.write(content);
        writer.flush();
        writer.close();
        return true;
    } catch (e) {
        logError("写入配置失败: " + (e as any).message);
        return false;
    }
}

export function loadConfig(): SubAgentConfig {
    try {
        const content = readText(CONFIG_FILE);
        if (!content) return freshConfig();
        const raw = JSON.parse(content);
        if (!raw || typeof raw !== "object" || raw.version !== 3) {
            logInfo("检测到旧版/异常配置，执行重建");
            return freshConfig();
        }

        const aliases: { [k: string]: string } = {};
        if (raw.aliases && typeof raw.aliases === "object") {
            for (const k of Object.keys(raw.aliases)) {
                const v = raw.aliases[k];
                if (typeof v === "string" && v) aliases[k] = v;
            }
        }

        const collection: string[] = Array.isArray(raw.collection)
            ? raw.collection.filter((x: any) => typeof x === "string" && x)
            : [];

        const accounts: { [k: string]: AccountEntry } = {};
        if (raw.accounts && typeof raw.accounts === "object") {
            for (const cid of Object.keys(raw.accounts)) {
                const ent = raw.accounts[cid] || {};
                const templates: FriendTemplate[] = Array.isArray(ent.templates)
                    ? ent.templates.filter((t: any) => t && t.name).map((t: any) => ({
                        name: String(t.name),
                        cardId: t.cardId || "",
                        cardName: t.cardName || ""
                    }))
                    : [];
                const instances: FriendInstance[] = Array.isArray(ent.instances)
                    ? ent.instances.filter((i: any) => i && i.chatId).map((i: any) => ({
                        id: i.id || i.chatId,
                        name: i.name || "",
                        cardId: i.cardId || "",
                        cardName: i.cardName || "",
                        chatId: String(i.chatId),
                        disabled: i.disabled === true,
                        isSelf: i.isSelf === true
                    }))
                    : [];
                accounts[cid] = { templates, instances };
            }
        }

        return { version: 3, aliases, collection, accounts };
    } catch (e) {
        logError("解析配置失败，重建: " + (e as any).message);
        return freshConfig();
    }
}

export function saveConfig(cfg: SubAgentConfig): boolean {
    const content = JSON.stringify(cfg, null, 2);
    const ok = writeText(CONFIG_FILE, content);
    if (ok) logInfo("配置已保存: aliases=" + Object.keys(cfg.aliases || {}).length + ", accounts=" + Object.keys(cfg.accounts || {}).length);
    return ok;
}

export function resetConfig(): boolean {
    try {
        const File = Java.type("java.io.File");
        const f = new File(CONFIG_FILE);
        return f.exists() ? f.delete() : true;
    } catch (_e) {
        return false;
    }
}

// ============================================================
// 账号隔离：模板库 & 实例
// ============================================================

export function getAccount(cfg: SubAgentConfig, chatId: string): AccountEntry {
    if (!chatId) return { templates: [], instances: [] };
    if (!cfg.accounts[chatId]) cfg.accounts[chatId] = { templates: [], instances: [] };
    return cfg.accounts[chatId];
}

/** 按映射替换显示名（无映射则原样） */
export function resolveAlias(name: string, aliases?: { [k: string]: string }): string {
    if (!name) return name;
    const map = aliases || loadConfig().aliases || {};
    const hit = map[name];
    return hit ? hit : name;
}

/** 判断角色卡原名是否在集合内（集合为空=不限制，返回 true） */
export function isInCollection(originalCardName: string, collection?: string[]): boolean {
    if (!originalCardName) return false;
    const col = collection || loadConfig().collection || [];
    if (col.length === 0) return true; // 空集合 = 不限制
    return col.indexOf(originalCardName) >= 0;
}

/** 设置集合成员（原名列表） */
export function setCollection(names: string[]): void {
    const cfg = loadConfig();
    cfg.collection = Array.isArray(names) ? names.filter((x) => typeof x === "string" && x) : [];
    saveConfig(cfg);
}

/** 反查：显示名（映射名或卡名）→ 角色卡原名。找不到返回原名 */
export function resolveOriginalName(displayName: string, aliases?: { [k: string]: string }): string {
    if (!displayName) return displayName;
    const map = aliases || loadConfig().aliases || {};
    // 若 displayName 本身是某条映射的值，返回其 key（原名）
    for (const k of Object.keys(map)) {
        if (map[k] === displayName) return k;
    }
    return displayName;
}

export function findTemplate(cfg: SubAgentConfig, chatId: string, name: string): FriendTemplate | null {
    const acct = getAccount(cfg, chatId);
    const key = (name || "").trim();
    if (!key) return null;
    for (const t of acct.templates) {
        if (t.name === key) return t;
    }
    return null;
}

export function addTemplate(chatId: string, tpl: FriendTemplate): void {
    if (!chatId || !tpl || !tpl.name) return;
    const cfg = loadConfig();
    const acct = getAccount(cfg, chatId);
    const exists = acct.templates.some(t => t.name === tpl.name);
    if (!exists) acct.templates.push(tpl);
    saveConfig(cfg);
}

export function removeTemplate(chatId: string, name: string): boolean {
    const cfg = loadConfig();
    const acct = getAccount(cfg, chatId);
    const before = acct.templates.length;
    acct.templates = acct.templates.filter(t => t.name !== name);
    const changed = acct.templates.length !== before;
    if (changed) saveConfig(cfg);
    return changed;
}

export function addInstance(chatId: string, inst: FriendInstance): void {
    if (!chatId || !inst || !inst.chatId) return;
    const cfg = loadConfig();
    const acct = getAccount(cfg, chatId);
    if (!acct.instances.some(i => i.chatId === inst.chatId)) acct.instances.push(inst);
    saveConfig(cfg);
}

export function removeInstance(chatId: string, chatIdOrId: string): boolean {
    const cfg = loadConfig();
    const acct = getAccount(cfg, chatId);
    const before = acct.instances.length;
    acct.instances = acct.instances.filter(i => i.chatId !== chatIdOrId && i.id !== chatIdOrId);
    const changed = acct.instances.length !== before;
    if (changed) saveConfig(cfg);
    return changed;
}

/** 取某会话下未禁用的实例 */
export function getVisibleInstances(cfg: SubAgentConfig, chatId: string): FriendInstance[] {
    return getAccount(cfg, chatId).instances.filter(i => !i.disabled);
}

/** 找某 chatId 对应的实例（含禁用的） */
export function findInstance(cfg: SubAgentConfig, chatId: string, targetChatId: string): FriendInstance | null {
    const acct = getAccount(cfg, chatId);
    for (const i of acct.instances) {
        if (i.chatId === targetChatId || i.id === targetChatId) return i;
    }
    return null;
}