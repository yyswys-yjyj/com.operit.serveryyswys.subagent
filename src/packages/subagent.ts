/* METADATA
{
    "name": "subagent",
    "display_name": {
        "zh": "AgentChat",
        "en": "AgentChat"
    },
    "description": {
        "zh": "AI 通讯录：让你（AI）和别的人设的 AI 互相聊天的小工具",
        "en": "SubAgent Contacts: AA little tool that lets you (AI) chat with other AI characters"
    },
    "enabledByDefault": true,
    "category": "Chat",
    "tools": [
        {
            "name": "add_friend",
            "description": {
                "zh": "添加一个好友模板（名片）。传入好友名与角色卡名（角色卡名可走映射）。模板库按会话隔离。",
                "en": "Add a friend template. Provide friend name and character card name (card name may use alias). Template library is per-session isolated."
            },
            "parameters": [
                { "name": "friend_name", "description": { "zh": "好友显示名（模板名）", "en": "Friend display name (template name)" }, "type": "string", "required": true },
                { "name": "card_name", "description": { "zh": "关联的角色卡名（可走映射）；不传则只建纯名片", "en": "Related character card name (alias allowed); omit for a name-only card" }, "type": "string", "required": false }
            ]
        },
        {
            "name": "remove_friend",
            "description": {
                "zh": "按好友名移除一个好友模板（名片）。已有的实例会话不受影响。",
                "en": "Remove a friend template by name. Existing instance sessions are unaffected."
            },
            "parameters": [
                { "name": "friend_name", "description": { "zh": "模板显示名", "en": "Template display name" }, "type": "string", "required": true }
            ]
        },
        {
            "name": "new",
            "description": {
                "zh": "基于一个好友模板创建一个子代理会话实例。不传 template_id 时默认用你自己（当前会话角色卡）创建。可对同一模板创建多个实例（同人格多实例）。",
                "en": "Create a sub-agent chat instance from a friend template. If template_id omitted, uses yourself (current session's card)."
            },
            "parameters": [
                { "name": "template_id", "description": { "zh": "模板名（映射名或角色卡名）；省略=用你自己", "en": "Template name (alias or card name); omit = yourself" }, "type": "string", "required": false },
                { "name": "title", "description": { "zh": "可选：新会话标题", "en": "Optional: new session title" }, "type": "string", "required": false }
            ]
        },
        {
            "name": "list",
            "description": {
                "zh": "列出当前会话已创建的好友实例（未禁用的）。",
                "en": "List current session's friend chat instances (not disabled)."
            },
            "parameters": []
        },
        {
            "name": "list_friends",
            "description": {
                "zh": "列出你已添加的好友模板（FriendList / 名片夹），即你能用 new 创建的对象。",
                "en": "List your added friend templates (FriendList), i.e. what you can create via new."
            },
            "parameters": []
        },
        {
            "name": "chat",
            "description": {
                "zh": "向属于当前会话的一个好友实例发送消息并返回回复。",
                "en": "Send a message to a friend instance belonging to the current session."
            },
            "parameters": [
                { "name": "chatid", "description": { "zh": "好友实例的会话 ID", "en": "Friend instance chat ID" }, "type": "string", "required": true },
                { "name": "content", "description": { "zh": "文本内容", "en": "Text content" }, "type": "string", "required": true }
            ]
        },
        {
            "name": "history",
            "description": {
                "zh": "读取属于当前会话的一个好友实例的历史消息。",
                "en": "Read message history of a friend instance belonging to the current session."
            },
            "parameters": [
                { "name": "chatid", "description": { "zh": "好友实例的会话 ID", "en": "Friend instance chat ID" }, "type": "string", "required": true },
                { "name": "limit", "description": { "zh": "可选：最近消息条数（默认 30）", "en": "Optional: recent count (default 30)" }, "type": "number", "required": false },
                { "name": "order", "description": { "zh": "可选：asc 或 desc（默认 asc）", "en": "Optional: asc or desc (default asc)" }, "type": "string", "required": false }
            ]
        },
        {
            "name": "market",
            "description": {
                "zh": "列出角色卡市场（可选的人格列表，全局共享，名称走映射）。",
                "en": "List the character card market (globally shared, names use alias)."
            },
            "parameters": []
        },
        {
            "name": "whoami",
            "description": {
                "zh": "返回你自己的角色卡名（走映射）与当前会话 ID。",
                "en": "Return your own character card name (alias applied) and current chat ID."
            },
            "parameters": []
        }
    ]
}
 */

// packages/subagent.ts
// 智能子代理核心逻辑 v3（账号隔离：模板库 + 实例）
// 每次调用先取 currentChatId = 「我是谁」，操作都限定在自己账号内。

import { logInfo } from "../utils/Logger";
import {
    loadConfig, saveConfig, resolveAlias, resolveOriginalName, findTemplate, addTemplate, removeTemplate,
    addInstance, removeInstance, getVisibleInstances, findInstance, isInCollection,
    getAccount, FriendTemplate, FriendInstance, SubAgentConfig
} from "../utils/ConfigStore";

export interface SubAgentResult {
    success: boolean;
    message: string;
    [key: string]: any;
}

/** 取当前调用方的会话 id（=「我是谁」） */
async function getMyChatId(): Promise<string> {
    try {
        const all: any = await (Tools as any).Chat.listAll();
        return all && all.currentChatId ? String(all.currentChatId) : "";
    } catch (e) {
        logInfo("getMyChatId 失败: " + (e as any).message);
        return "";
    }
}

/** 查当前会话自身的角色卡名（原名 + 显示名） */
async function getSelfCard(owner: string): Promise<{ cardName: string; cardId: string }> {
    try {
        const all: any = await (Tools as any).Chat.listAll();
        const chats: any[] = (all && all.chats) || [];
        for (const c of chats) {
            const id = c.id || c.chatId || c.chat_id || "";
            if (id === owner) {
                return {
                    cardName: c.characterCardName || c.character_card_name || "",
                    cardId: c.characterCardId || c.character_card_id || ""
                };
            }
        }
    } catch (_e) { /* ignore */ }
    return { cardName: "", cardId: "" };
}

/** 按显示名（映射名或卡名）在全量角色卡中找卡 */
async function findCardByDisplayName(displayOrCard: string): Promise<{ id: string; name: string } | null> {
    if (!displayOrCard) return null;
    const cfg = loadConfig();
    const original = resolveOriginalName(displayOrCard, cfg.aliases);
    try {
        const g: any = (typeof Tools !== "undefined") ? (Tools as any) : null;
        let cards: any[] = [];
        if (g && g.SoftwareSettings && typeof g.SoftwareSettings.listCharacterCards === "function") {
            const r: any = await g.SoftwareSettings.listCharacterCards();
            cards = (r && r.cards) || [];
        } else if (typeof (globalThis as any).toolCall === "function") {
            const r: any = await (globalThis as any).toolCall("list_character_cards", {});
            cards = (r && r.cards) || [];
        }
        for (const c of cards) {
            const cn = c.name || "";
            // 卡原名匹配，或映射后匹配
            if (cn === original || resolveAlias(cn, cfg.aliases) === displayOrCard) {
                return { id: c.id || "", name: cn };
            }
        }
    } catch (e) {
        logInfo("findCardByDisplayName 失败: " + (e as any).message);
    }
    return null;
}

/**
 * add_friend —— 添加好友模板（名片）
 */
export async function addFriend(params: any): Promise<SubAgentResult> {
    const friendName: string = (params?.friend_name || params?.name || "").toString().trim();
    const cardNameIn: string = (params?.card_name || "").toString().trim();
    if (!friendName) return { success: false, message: "缺少 friend_name" };

    const owner = await getMyChatId();
    if (!owner) return { success: false, message: "无法确定当前会话" };

    let cardId = "";
    let cardName = "";
    if (cardNameIn) {
        const card = await findCardByDisplayName(cardNameIn);
        if (!card) return { success: false, message: "未找到角色卡：" + cardNameIn };
        // 集合校验：不在集合内则拒绝
        const cfg0 = loadConfig();
        if (!isInCollection(card.name, cfg0.collection)) {
            return { success: false, message: "该角色卡不在集合内，禁止添加：" + resolveAlias(card.name, cfg0.aliases) };
        }
        cardId = card.id;
        cardName = card.name;
    }

    const tpl: FriendTemplate = { name: friendName, cardId, cardName };
    addTemplate(owner, tpl);
    const cfgNow = loadConfig();
    logInfo("add_friend: owner=" + owner + ", name=" + friendName);
    return { success: true, message: "已添加好友模板：" + friendName, friend_name: friendName, cardName: cardName ? resolveAlias(cardName, cfgNow.aliases) : "" };
}

/**
 * remove_friend —— 移除好友模板
 */
export async function removeFriend(params: any): Promise<SubAgentResult> {
    const friendName: string = (params?.friend_name || params?.name || "").toString().trim();
    if (!friendName) return { success: false, message: "缺少 friend_name" };
    const owner = await getMyChatId();
    if (!owner) return { success: false, message: "无法确定当前会话" };

    const ok = removeTemplate(owner, friendName);
    return ok
        ? { success: true, message: "已移除好友模板：" + friendName }
        : { success: false, message: "未找到模板：" + friendName };
}

/**
 * new —— 基于模板创建实例会话
 */
export async function newAgent(params: any): Promise<SubAgentResult> {
    const titleIn: string = (params?.title || "").toString().trim();
    const templateId: string = (params?.template_id || params?.friend_name || "").toString().trim();

    const owner = await getMyChatId();
    if (!owner) return { success: false, message: "无法确定当前会话" };

    const cfg = loadConfig();

    let cardId = "";
    let cardName = "";
    let displayName = "";
    let title = titleIn;

    if (templateId) {
        const tpl = findTemplate(cfg, owner, templateId);
        if (!tpl) {
            return { success: false, message: "未找到好友模板：" + templateId + "（请先用 add_friend 添加）" };
        }
        cardId = tpl.cardId;
        cardName = tpl.cardName;
        displayName = tpl.name;
    } else {
        // 默认：用「自己」
        const self = await getSelfCard(owner);
        cardId = self.cardId;
        cardName = self.cardName;
        displayName = resolveAlias(cardName, cfg.aliases) || "你";
    }
    if (!title) title = displayName || "子代理";

    try {
        try {
            await (Tools as any).Chat.startService({ initial_mode: "BALL", keep_if_exists: true });
        } catch (_e) { /* ok */ }

        const creation: any = await (Tools as any).Chat.createNew(title, false, cardId || undefined);
        const chatId = (creation?.chatId || creation?.chat_id || "").toString().trim();
        if (!chatId) return { success: false, message: "创建会话失败：未返回 chatId" };

        try {
            await (Tools as any).Chat.updateTitle(chatId, "[友] " + title.substring(0, 40));
        } catch (_e) { /* ok */ }

        // 作为实例加入当前会话
        const instName = (templateId ? displayName : (resolveAlias(cardName, cfg.aliases) || displayName || title));
        const inst: FriendInstance = {
            id: chatId,
            name: instName || "好友",
            cardId, cardName,
            chatId,
            disabled: false,
            isSelf: false
        };
        addInstance(owner, inst);

        logInfo("new 成功: owner=" + owner + ", child=" + chatId + ", card=" + cardName);
        return {
            success: true,
            message: "已创建好友实例：" + inst.name + "（" + chatId + "）",
            chatId,
            friend_name: inst.name,
            ownerChatId: owner
        };
    } catch (e) {
        return { success: false, message: "创建会话失败: " + (e as any).message };
    }
}

/**
 * list —— 列实例（当前会话已创建的好友会话）
 */
export async function list(params: any): Promise<SubAgentResult> {
    const owner = await getMyChatId();
    if (!owner) return { success: false, message: "无法确定当前会话" };

    const cfg = loadConfig();

    // 自动补「自己」实例（首次访问时）
    try {
        const acct0 = getAccount(cfg, owner);
        if (!acct0.instances.some((x: any) => x.isSelf)) {
            const self = await getSelfCard(owner);
            acct0.instances.push({
                id: owner,
                name: resolveAlias(self.cardName, cfg.aliases) || "你",
                cardId: self.cardId,
                cardName: self.cardName,
                chatId: owner,
                disabled: false,
                isSelf: true
            });
            saveConfig(cfg);
        }
    } catch (_e) { /* ignore */ }

    const visible = getVisibleInstances(cfg, owner);

    // 补标题/卡名
    let allChats: any[] = [];
    try {
        const all: any = await (Tools as any).Chat.listAll();
        allChats = (all && all.chats) || [];
    } catch (_e) { /* ok */ }
    const infoById: { [id: string]: any } = {};
    for (const c of allChats) {
        const id = c.id || c.chatId || c.chat_id || "";
        if (id) infoById[id] = c;
    }

    const instances = visible.map((i) => {
        const c = infoById[i.chatId] || {};
        const rawName = c.characterCardName || i.cardName || "";
        // 显示名优先用实例自身 name（=模板名/映射名），回退到映射后的卡名
        const base = i.name || resolveAlias(rawName, cfg.aliases);
        return {
            chatId: i.chatId,
            name: i.isSelf ? (base + "（你）") : base,
            title: c.title || "(已不存在或已删除)",
            cardName: resolveAlias(rawName, cfg.aliases),
            isSelf: i.isSelf
        };
    });

    return {
        success: true,
        message: "好友实例 " + instances.length + " 个",
        ownerChatId: owner,
        count: instances.length,
        instances
    };
}

/**
 * list_friends —— 列出你已有的好友模板（FriendList / 名片夹）
 */
export async function listFriends(_params: any): Promise<SubAgentResult> {
    const owner = await getMyChatId();
    if (!owner) return { success: false, message: "无法确定当前会话" };

    const cfg = loadConfig();
    const acct = getAccount(cfg, owner);
    const templates = acct.templates.map(t => ({
        template_id: t.name,
        name: t.name,
        cardName: t.cardName ? resolveAlias(t.cardName, cfg.aliases) : "",
        cardId: t.cardId || ""
    }));

    return {
        success: true,
        message: "你的好友模板 " + templates.length + " 个",
        ownerChatId: owner,
        count: templates.length,
        templates
    };
}

/** 校验目标 chatId 是否属于当前会话（且未禁用） */
async function ensureOwned(chatId: string): Promise<{ ok: boolean; owner: string; msg?: string }> {
    const owner = await getMyChatId();
    if (!owner) return { ok: false, owner: "", msg: "无法确定当前会话" };
    const cfg = loadConfig();
    const inst = findInstance(cfg, owner, chatId);
    if (!inst) return { ok: false, owner, msg: "拒绝：该会话不属于当前会话（越权）" };
    if (inst.disabled) return { ok: false, owner, msg: "拒绝：该好友已被禁用" };
    return { ok: true, owner };
}

/**
 * chat —— 向好友实例发消息
 */
export async function chat(params: any): Promise<SubAgentResult> {
    const chatId: string = (params?.chatid || params?.chatId || "").toString().trim();
    const content: string = (params?.content || params?.message || "").toString();
    if (!chatId) return { success: false, message: "缺少 chatid" };
    if (!content) return { success: false, message: "缺少 content" };

    const chk = await ensureOwned(chatId);
    if (!chk.ok) return { success: false, message: chk.msg || "无权访问该会话", chatId };

    try {
        const result: any = await (Tools as any).Chat.sendMessage(
            content, chatId, undefined, undefined,
            { persist_turn: true, notify_reply: true, hide_user_message: true, disable_warning: true, timeout_ms: 86400000 }
        );
        const aiResponse = (result?.aiResponse || result?.message || "").toString();
        logInfo("chat 完成: owner=" + chk.owner + ", child=" + chatId);
        return { success: true, message: "消息已发送", chatId, content, aiResponse: aiResponse || null };
    } catch (e) {
        return { success: false, message: "发送失败: " + (e as any).message, chatId };
    }
}

/**
 * history —— 读好友实例历史（role 走映射）
 */
export async function history(params: any): Promise<SubAgentResult> {
    const chatId: string = (params?.chatid || params?.chatId || "").toString().trim();
    const limit: number = params?.limit && Number(params.limit) > 0 ? Number(params.limit) : 30;
    const order: "asc" | "desc" = params?.order === "desc" ? "desc" : "asc";
    if (!chatId) return { success: false, message: "缺少 chatid" };

    const chk = await ensureOwned(chatId);
    if (!chk.ok) return { success: false, message: chk.msg || "无权访问该会话", chatId };

    try {
        const result: any = await (Tools as any).Chat.getMessages(chatId, { order, limit });
        const messages: any[] = result?.messages || [];
        const aliases = loadConfig().aliases || {};
        const simplified = messages.map((m: any) => {
            const rawName = m.roleName || m.sender || "";
            const display = (m.sender === "user") ? rawName : resolveAlias(rawName, aliases);
            return { role: display, content: (m.content || "").toString(), timestamp: m.timestamp || 0 };
        });
        return { success: true, message: "获取到 " + simplified.length + " 条消息", chatId, count: simplified.length, messages: simplified };
    } catch (e) {
        return { success: false, message: "读取历史失败: " + (e as any).message, chatId };
    }
}

/**
 * market —— 列角色卡市场（全局，名称走映射）
 */
export async function market(_params: any): Promise<SubAgentResult> {
    const cfg = loadConfig();
    let cards: any[] = [];
    try {
        const g: any = (typeof Tools !== "undefined") ? (Tools as any) : null;
        if (g && g.SoftwareSettings && typeof g.SoftwareSettings.listCharacterCards === "function") {
            const r: any = await g.SoftwareSettings.listCharacterCards();
            cards = (r && r.cards) || [];
        } else if (typeof (globalThis as any).toolCall === "function") {
            const r: any = await (globalThis as any).toolCall("list_character_cards", {});
            cards = (r && r.cards) || [];
        }
    } catch (e) {
        return { success: false, message: "读取市场失败: " + (e as any).message };
    }
    const list_ = cards
        .filter((c: any) => isInCollection(c.name || "", cfg.collection))
        .map((c: any) => ({
            cardId: c.id || "",
            cardName: resolveAlias(c.name || "", cfg.aliases),
            isDefault: c.isDefault === true
        }));
    return { success: true, message: "市场共 " + list_.length + " 个人设", count: list_.length, personas: list_ };
}

/**
 * whoami —— 我是谁
 */
export async function whoami(_params: any): Promise<SubAgentResult> {
    const owner = await getMyChatId();
    if (!owner) return { success: false, message: "无法确定当前会话" };
    const cfg = loadConfig();
    const self = await getSelfCard(owner);
    const display = resolveAlias(self.cardName, cfg.aliases) || "（未绑定角色卡）";
    return {
        success: true,
        message: "你是：" + display,
        chatId: owner,
        cardName: display,
        cardId: self.cardId
    };
}

// ---------------------------------------------------------------------------
// 工具名对齐：宿主按 METADATA 的 name 逐字查 exports[name]，不做驼峰转换。
// 带下划线的工具名需显式挂别名；"new" 是 JS 保留字同理。
// ---------------------------------------------------------------------------
declare const module: any;
try {
    if (typeof module !== "undefined" && module.exports) {
        const ex = module.exports as any;
        ex["new"] = newAgent;
        ex["add_friend"] = addFriend;
        ex["remove_friend"] = removeFriend;
        ex["list_friends"] = listFriends;
    }
} catch (_e) { /* ignore */ }