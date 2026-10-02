// utils/PersonalityHelper.ts

import { logInfo, logError } from "./Logger";

export interface CardBrief {
    id: string;
    name: string;
    description: string;
    isDefault: boolean;
}

export interface CardFull extends CardBrief {
    characterSetting: string;
}

export class PersonalityHelper {
    private static instance: PersonalityHelper | null = null;
    private cache: CardFull[] = [];
    private cacheTime = 0;
    private readonly CACHE_TTL = 30000;
    private injectedCallTool: ((name: string, params?: any) => Promise<any>) | null = null;

    static getInstance(): PersonalityHelper {
        if (!PersonalityHelper.instance) {
            PersonalityHelper.instance = new PersonalityHelper();
        }
        return PersonalityHelper.instance;
    }

    /** 注入当前上下文可用的 callTool（UI 里由 ctx.callTool 提供） */
    setCallTool(fn: (name: string, params?: any) => Promise<any>): void {
        this.injectedCallTool = fn;
    }

    /** 全量拉取角色卡（含 characterSetting） */
    async fetchAll(): Promise<CardFull[]> {
        const now = Date.now();
        if (this.cache.length > 0 && (now - this.cacheTime) < this.CACHE_TTL) {
            return this.cache;
        }

        // ---- 优先路径：注入的 callTool（UI 上下文用 ctx.callTool）----
        if (this.injectedCallTool) {
            try {
                const result: any = await this.injectedCallTool("list_character_cards", {});
                const rawCards = this.pickCards(result);
                if (rawCards.length > 0) {
                    const cards = rawCards.map((c: any) => this.normalize(c));
                    this.cache = cards;
                    this.cacheTime = now;
                    logInfo("callTool 获取 " + cards.length + " 个角色卡");
                    return cards;
                }
            } catch (e) {
                logError("注入 callTool 读卡失败，回退: " + (e as any).message);
            }
        }

        // ---- 主路径：Tools.SoftwareSettings.listCharacterCards ----
        try {
            const SS: any = (typeof Tools !== "undefined") ? (Tools as any).SoftwareSettings : null;
            if (SS && typeof SS.listCharacterCards === "function") {
                const result: any = await SS.listCharacterCards();
                const rawCards = this.pickCards(result);
                if (rawCards.length > 0) {
                    const cards = rawCards.map((c: any) => this.normalize(c));
                    this.cache = cards;
                    this.cacheTime = now;
                    logInfo("SoftwareSettings 获取 " + cards.length + " 个角色卡");
                    return cards;
                }
            }
        } catch (e) {
            logError("SoftwareSettings.listCharacterCards 失败，回退: " + (e as any).message);
        }

        // ---- 降级路径：toolCall('list_character_cards') ----
        try {
            if (typeof toolCall === "function") {
                const result: any = await toolCall("list_character_cards", {});
                const rawCards = this.pickCards(result);
                const cards = rawCards.map((c: any) => this.normalize(c));
                this.cache = cards;
                this.cacheTime = now;
                logInfo("toolCall 获取 " + cards.length + " 个角色卡");
                return cards;
            }
        } catch (e) {
            logError("toolCall('list_character_cards') 失败: " + (e as any).message);
        }

        return [];
    }

    /** 仅返回简要信息（UI 列表用） */
    async getBriefs(): Promise<CardBrief[]> {
        const cards = await this.fetchAll();
        return cards.map(c => ({
            id: c.id, name: c.name, description: c.description, isDefault: c.isDefault
        }));
    }

    private pickCards(result: any): any[] {
        if (!result) return [];
        if (Array.isArray(result.cards)) return result.cards;
        if (result.data && Array.isArray(result.data.cards)) return result.data.cards;
        if (Array.isArray(result)) return result;
        return [];
    }

    private normalize(c: any): CardFull {
        return {
            id: c.id || "",
            name: c.name || "",
            description: c.description || "",
            characterSetting: c.characterSetting || c.character_setting || "",
            isDefault: c.isDefault || c.is_default || false
        };
    }
}

export function resetPersonalityCache(): void {
    const inst = PersonalityHelper.getInstance() as any;
    inst.cache = [];
    inst.cacheTime = 0;
}