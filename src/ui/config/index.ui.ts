// ui/config/index.ui.ts

import { ConfigStateHolder, ConfigUiState } from "./ConfigState";
import { CardBrief } from "../../utils/PersonalityHelper";

export default function ConfigScreen(ctx: any) {
    const cs = ctx.MaterialTheme.colorScheme;

    const holder = ctx.useMemo("subagent_cfg_holder", () => new ConfigStateHolder(), []);
    const [tick, setTick] = ctx.useState("subagent_cfg_tick", 0);

    holder.bindCtx(ctx);

    // 只订阅刷新信号（同步回调）
    ctx.useMemo("subagent_cfg_subscribe", () => {
        const off = holder.onChange(() => setTick((t: number) => t + 1));
        return () => { off(); };
    }, []);

    // ---- 纯读状态 ----
    const state: ConfigUiState = holder.get();
    const cards: CardBrief[] = state.cards || [];
    const loading = state.loading;

    const items: any[] = [];
    items.push(ctx.UI.Spacer({ height: 16 }));

    // ========== 顶部：账号信息 ==========
    items.push(ctx.UI.Card({ elevation: 2, modifier: ctx.Modifier.fillMaxWidth() }, [
        ctx.UI.Column({ padding: 18 }, [
            ctx.UI.Row({ verticalAlignment: "center", fillMaxWidth: true, horizontalArrangement: "spaceBetween" }, [
                ctx.UI.Row({ verticalAlignment: "center" }, [
                    ctx.UI.Icon({ name: "smart_toy", size: 24, tint: cs.primary }),
                    ctx.UI.Spacer({ width: 10 }),
                    ctx.UI.Text({ text: "智能子代理", fontSize: 20, fontWeight: "bold", color: cs.primary })
                ]),
                ctx.UI.IconButton({
                    icon: "refresh",
                    onClick: async () => { await holder.reloadCards(); },
                    enabled: !loading,
                    modifier: ctx.Modifier.width(40).height(40)
                })
            ]),
            ctx.UI.Spacer({ height: 8 }),
            ctx.UI.Text({
                text: "每个会话是一个独立账号，只能与自己 new 出来的子代理互聊。",
                fontSize: 12, color: cs.onSurfaceVariant
            }),
            ctx.UI.Spacer({ height: 12 }),
            ctx.UI.Surface({
                containerColor: cs.surfaceVariant,
                shape: { type: "rounded", cornerRadius: 10 },
                modifier: ctx.Modifier.fillMaxWidth()
            }, [
                ctx.UI.Column({ padding: 12 }, [
                    ctx.UI.Text({
                        text: "当前会话 ID：" + (state.myChatId ? state.myChatId.substring(0, 18) + "…" : "（未获取）"),
                        fontSize: 12, color: cs.onSurface
                    }),
                    ctx.UI.Spacer({ height: 4 }),
                    ctx.UI.Text({
                        text: "好友模板：" + state.templateCount + " 个 · 已建实例：" + state.instanceCount + " 个",
                        fontSize: 12, fontWeight: "bold", color: cs.primary
                    })
                ])
            ])
        ])
    ]));

    items.push(ctx.UI.Spacer({ height: 12 }));

    // ========== 角色卡名称映射 ==========
    const aliasKids: any[] = [];
    aliasKids.push(ctx.UI.Row({ verticalAlignment: "center" }, [
        ctx.UI.Icon({ name: "drive_file_rename_outline", size: 18, tint: cs.primary }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: "角色卡名称映射", fontSize: 16, fontWeight: "bold" }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: "（全局共享）", fontSize: 11, color: cs.onSurfaceVariant })
    ]));
    aliasKids.push(ctx.UI.Spacer({ height: 4 }));
    aliasKids.push(ctx.UI.Text({
        text: "为角色卡设置自定义显示名；子代理消息里的卡名会被静默替换。留空=不映射。",
        fontSize: 11, color: cs.onSurfaceVariant
    }));
    aliasKids.push(ctx.UI.Spacer({ height: 10 }));

    if (loading) {
        aliasKids.push(ctx.UI.Text({ text: "加载角色卡中…", fontSize: 13, color: cs.onSurfaceVariant }));
    } else if (cards.length === 0) {
        aliasKids.push(ctx.UI.Text({ text: "尚未获取角色卡列表", fontSize: 12, color: cs.onSurfaceVariant }));
        aliasKids.push(ctx.UI.Spacer({ height: 8 }));
        aliasKids.push(ctx.UI.Button({
            onClick: async () => { await holder.reloadCards(); },
            containerColor: cs.secondaryContainer,
            contentColor: cs.onSecondaryContainer,
            modifier: ctx.Modifier.fillMaxWidth().padding(2),
            content: ctx.UI.Row({ verticalAlignment: "center" }, [
                ctx.UI.Icon({ name: "cloud_download", size: 18, tint: cs.onSecondaryContainer }),
                ctx.UI.Spacer({ width: 6 }),
                ctx.UI.Text({ text: "获取角色卡列表", color: cs.onSecondaryContainer })
            ])
        }));
    } else {
        for (let i = 0; i < cards.length; i++) {
            const c = cards[i];
            const original = c.name || "";
            const alias = holder.getAlias(original);
            const hasAlias = !!alias;
            aliasKids.push(ctx.UI.Row({ verticalAlignment: "center", fillMaxWidth: true, modifier: ctx.Modifier.padding({ vertical: 3 }) }, [
                ctx.UI.Column({ modifier: ctx.Modifier.width(100) }, [
                    ctx.UI.Text({ text: original || "未命名", fontSize: 12, fontWeight: "bold", maxLines: 1, color: hasAlias ? cs.primary : cs.onSurface }),
                    ctx.UI.Text({ text: hasAlias ? ("→ " + alias) : "未映射", fontSize: 10, color: hasAlias ? cs.primary : cs.onSurfaceVariant, maxLines: 1 })
                ]),
                ctx.UI.Spacer({ width: 8 }),
                ctx.UI.TextField({
                    value: alias,
                    onValueChange: (v: string) => holder.setAlias(original, v),
                    placeholder: "自定义名",
                    singleLine: true,
                    modifier: ctx.Modifier.weight(1)
                })
            ]));
        }
        if (Object.keys(state.cardAliases || {}).length > 0) {
            aliasKids.push(ctx.UI.Spacer({ height: 8 }));
            aliasKids.push(ctx.UI.Button({
                onClick: () => holder.clearAllAliases(),
                containerColor: cs.errorContainer,
                contentColor: cs.onErrorContainer,
                modifier: ctx.Modifier.fillMaxWidth().padding(2),
                content: ctx.UI.Text({ text: "清空全部映射", color: cs.onErrorContainer })
            }));
        }
    }

    items.push(ctx.UI.Card({ elevation: 2, modifier: ctx.Modifier.fillMaxWidth() }, [
        ctx.UI.Column({ padding: 16 }, aliasKids)
    ]));

    items.push(ctx.UI.Spacer({ height: 12 }));

    // ========== 集合（白名单）==========
    const colKids: any[] = [];
    colKids.push(ctx.UI.Row({ verticalAlignment: "center" }, [
        ctx.UI.Icon({ name: "playlist_add_check", size: 18, tint: cs.primary }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: "集合", fontSize: 16, fontWeight: "bold" }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: "（全局）", fontSize: 11, color: cs.onSurfaceVariant })
    ]));
    colKids.push(ctx.UI.Spacer({ height: 4 }));
    colKids.push(ctx.UI.Text({
        text: "决定哪些角色卡能进入市场、可被 add_friend 添加。全不勾选 = 不限制（全部放行）。",
        fontSize: 11, color: cs.onSurfaceVariant
    }));
    colKids.push(ctx.UI.Spacer({ height: 10 }));

    if (loading) {
        colKids.push(ctx.UI.Text({ text: "加载角色卡中…", fontSize: 13, color: cs.onSurfaceVariant }));
    } else if (cards.length === 0) {
        colKids.push(ctx.UI.Text({ text: "请先获取角色卡列表", fontSize: 12, color: cs.onSurfaceVariant }));
    } else {
        for (let i = 0; i < cards.length; i++) {
            const c = cards[i];
            const original = c.name || "";
            const checked = holder.isCollected(original);
            colKids.push(ctx.UI.Row({ verticalAlignment: "center", fillMaxWidth: true, modifier: ctx.Modifier.padding({ vertical: 2 }) }, [
                ctx.UI.Column({ modifier: ctx.Modifier.weight(1) }, [
                    ctx.UI.Text({ text: holder.getAlias(original) || original || "未命名", fontSize: 13, maxLines: 1 }),
                    (holder.getAlias(original) && original) ? ctx.UI.Text({ text: original, fontSize: 10, color: cs.onSurfaceVariant, maxLines: 1 }) : ctx.UI.Spacer({ height: 0 })
                ]),
                ctx.UI.Switch({
                    checked: checked,
                    onCheckedChange: (v: boolean) => holder.toggleCollection(original, v)
                })
            ]));
        }
        if ((state.collection || []).length > 0) {
            colKids.push(ctx.UI.Spacer({ height: 8 }));
            colKids.push(ctx.UI.Row({ verticalAlignment: "center" }, [
                ctx.UI.Text({ text: "已选集 " + state.collection.length + " 项", fontSize: 11, color: cs.onSurfaceVariant, modifier: ctx.Modifier.weight(1) }),
                ctx.UI.Button({
                    onClick: () => holder.clearCollection(),
                    containerColor: cs.errorContainer,
                    contentColor: cs.onErrorContainer,
                    modifier: ctx.Modifier.padding(2),
                    content: ctx.UI.Text({ text: "清空集合", color: cs.onErrorContainer })
                })
            ]));
        }
    }

    items.push(ctx.UI.Card({ elevation: 2, modifier: ctx.Modifier.fillMaxWidth() }, [
        ctx.UI.Column({ padding: 16 }, colKids)
    ]));

    // ========== 状态提示 ==========
    if (state.statusText) {
        items.push(ctx.UI.Spacer({ height: 10 }));
        items.push(ctx.UI.Row({ verticalAlignment: "center" }, [
            ctx.UI.Icon({ name: state.statusOk ? "check_circle" : "error", size: 16, tint: state.statusOk ? cs.primary : cs.error }),
            ctx.UI.Spacer({ width: 6 }),
            ctx.UI.Text({ text: state.statusText, fontSize: 13, color: state.statusOk ? cs.primary : cs.error })
        ]));
    }

    // ========== 保存 ==========
    items.push(ctx.UI.Spacer({ height: 16 }));
    items.push(ctx.UI.Button({
        onClick: () => holder.save(),
        containerColor: cs.primary,
        contentColor: cs.onPrimary,
        modifier: ctx.Modifier.fillMaxWidth(),
        content: ctx.UI.Text({ text: "保存名称映射", color: cs.onPrimary, fontWeight: "bold" })
    }));
    items.push(ctx.UI.Spacer({ height: 30 }));

    // 根节点 onLoad：异步加载进 action 链
    return ctx.UI.LazyColumn({
        fillMaxSize: true,
        padding: 16,
        onLoad: async () => { await holder.reloadCards(); }
    }, items);
}