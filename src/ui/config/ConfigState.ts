// ui/config/ConfigState.ts
// 工具箱配置界面状态持有者

import { loadConfig, saveConfig, SubAgentConfig, getAccount } from "../../utils/ConfigStore";
import { PersonalityHelper, CardBrief } from "../../utils/PersonalityHelper";
import { logInfo, logError } from "../../utils/Logger";

export interface ConfigUiState {
    cards: CardBrief[];
    loading: boolean;
    loaded: boolean;
    /** 全局角色卡名称映射：{ 原名: 自定义名 } */
    cardAliases: { [original: string]: string };
    /** 全局集合：允许进入市场/被添加的卡「原名」白名单；空=不限制 */
    collection: string[];
    myChatId: string;
    templateCount: number;
    instanceCount: number;
    statusText: string;
    statusOk: boolean;
}

export class ConfigStateHolder {
    public state: ConfigUiState;
    private listeners: Array<() => void> = [];
    private loading = false;
    private callToolFn: ((name: string, params?: any) => Promise<any>) | null = null;

    constructor() {
        const cfg = loadConfig();
        this.state = {
            cards: [],
            loading: false,
            loaded: false,
            cardAliases: { ...(cfg.aliases || {}) },
            collection: [...(cfg.collection || [])],
            myChatId: "",
            templateCount: 0,
            instanceCount: 0,
            statusText: "",
            statusOk: true
        };
    }

    bindCtx(ctx: any): void {
        try {
            if (ctx && typeof ctx.callTool === "function") {
                this.callToolFn = (name: string, params: any) => ctx.callTool(name, params);
            } else if (ctx && typeof ctx.toolCall === "function") {
                this.callToolFn = (name: string, params: any) => ctx.toolCall(name, params);
            }
        } catch (e) {
            logError("bindCtx 失败: " + (e as any).message);
        }
    }

    private async callTool(name: string, params: any): Promise<any> {
        if (!this.callToolFn) throw new Error("callTool 未就绪");
        return await this.callToolFn(name, params);
    }

    get(): ConfigUiState { return this.state; }

    onChange(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            const i = this.listeners.indexOf(listener);
            if (i >= 0) this.listeners.splice(i, 1);
        };
    }

    notify(): void {
        for (const l of this.listeners) {
            try { l(); } catch (_e) { /* ignore */ }
        }
    }

    patch(p: Partial<ConfigUiState>): void {
        this.state = { ...this.state, ...p };
        this.notify();
    }

    async reloadCards(): Promise<void> {
        if (this.loading) return;
        this.loading = true;
        this.patch({ loading: true, statusText: "", statusOk: true });
        try {
            let myId = "";
            try {
                const all: any = await this.callTool("list_chats", {});
                const cur = all && (all.currentChatId || (all.data && all.data.currentChatId));
                if (cur) myId = String(cur);
            } catch (_e) { /* ignore */ }

            let templateCount = 0;
            let instanceCount = 0;
            try {
                const cfg = loadConfig();
                if (myId) {
                    const acct = getAccount(cfg, myId);
                    templateCount = (acct.templates || []).length;
                    instanceCount = (acct.instances || []).filter((x: any) => !x.disabled).length;
                }
            } catch (_e) { /* ignore */ }

            const helper = PersonalityHelper.getInstance();
            helper.setCallTool((name: string, params: any) => this.callTool(name, params));
            const briefs = await helper.getBriefs();

            this.loading = false;
            this.patch({
                cards: briefs || [],
                loading: false, loaded: true,
                myChatId: myId, templateCount, instanceCount
            });
            logInfo("UI 加载完成: 卡 " + (briefs ? briefs.length : 0) + ", 模板 " + templateCount + ", 实例 " + instanceCount);
        } catch (e) {
            this.loading = false;
            this.patch({ loading: false, loaded: true, statusText: "加载失败: " + (e as any).message, statusOk: false });
            logError("UI 加载失败: " + (e as any).message);
        }
    }

    setAlias(originalName: string, alias: string): void {
        const next = { ...this.state.cardAliases };
        const val = (alias || "").trim();
        if (val) next[originalName] = val; else delete next[originalName];
        this.patch({ cardAliases: next, statusText: "", statusOk: true });
    }

    getAlias(originalName: string): string {
        return (this.state.cardAliases || {})[originalName] || "";
    }

    clearAllAliases(): void {
        this.patch({ cardAliases: {}, statusText: "已清空全部名称映射（未保存）", statusOk: true });
    }

    /** 切换某张卡是否在集合内 */
    toggleCollection(originalName: string, inCollection: boolean): void {
        const set = new Set(this.state.collection || []);
        if (inCollection) set.add(originalName); else set.delete(originalName);
        this.patch({ collection: Array.from(set), statusText: "", statusOk: true });
    }

    isCollected(originalName: string): boolean {
        const col = this.state.collection || [];
        if (col.length === 0) return false; // 空集合时 UI 不预勾选（语义：不限制）
        return col.indexOf(originalName) >= 0;
    }

    clearCollection(): void {
        this.patch({ collection: [], statusText: "已清空集合（未保存）", statusOk: true });
    }

    save(): void {
        const cur: SubAgentConfig = loadConfig();
        const cfg: SubAgentConfig = {
            version: 3,
            aliases: { ...(this.state.cardAliases || {}) },
            collection: [...(this.state.collection || [])],
            accounts: cur.accounts || {}
        };
        const ok = saveConfig(cfg);
        const aliasCount = Object.keys(cfg.aliases || {}).length;
        this.patch({
            statusText: ok ? ("已保存 · 名称映射 " + aliasCount + " 条 · 集合 " + cfg.collection.length + " 项") : "保存失败",
            statusOk: ok
        });
    }
}