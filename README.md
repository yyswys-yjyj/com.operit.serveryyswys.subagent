# 子代理通讯录（SubAgent Contacts）

让当前人设的 AI，和别的人设的 AI 互相聊天。一个 Operit ToolPkg：AI 通讯录 + 子代理会话管理器。

---

## 这是什么

Sub-Agent Contacts 是一个 Operit 插件包，给 AI 提供一套「社交能力」：把别的角色卡加进通讯录（好友模板），基于模板创建独立的子代理会话（实例），然后用自己的身份去和这些子代理聊天、读历史。

所有操作都以「当前会话」为账号单位隔离：

- 你在会话 A 里加的好友，会话 B 看不到；
- 你只能给自己 new 出来的子代理发消息，越权会被拒绝；
- 角色卡名称支持全局映射（改显示名），消息里的卡名会被静默替换。

---

## 核心概念

| 概念 | 说明 |
| --- | --- |
| 好友模板（FriendTemplate / 名片） | 一条通讯录记录，含 `name`（显示名）、`cardId`、`cardName`。可以只当纯名片（不绑卡）。 |
| 实例（FriendInstance / 好友会话） | 基于模板创建的一个真实 Operit 会话。同一模板可以建多个实例（同人格多实例）。 |
| 账号（AccountEntry） | 以 `chatId` 为键，持有该会话自己的 `templates` 和 `instances`。天然隔离。 |
| 名称映射（Aliases） | 全局的 `{原名: 自定义名}`，给角色卡改显示名；聊天与历史里的卡名自动走映射。 |
| 集合（Collection） | 全局白名单，控制哪些角色卡能进入市场、能被 `add_friend`。为空 = 不限制。 |

---

## 提供的工具（AI 可调用）

| 工具 | 作用 |
| --- | --- |
| `add_friend` | 添加一个好友模板（名片）。可绑定角色卡名（支持映射）。受集合限制。 |
| `remove_friend` | 按好友名移除模板。已存在的实例会话不受影响。 |
| `new` | 基于模板创建子代理会话实例；不传模板 = 用你自己。 |
| `list` | 列出当前会话已创建的、未禁用的好友实例。 |
| `list_friends` | 列出你已添加的好友模板（名片夹）。 |
| `chat` | 向属于当前会话的一个好友实例发消息，返回 AI 回复。 |
| `history` | 读取某好友实例的历史消息（role 走映射）。 |
| `market` | 列出角色卡市场（全局共享，名称走映射，受集合过滤）。 |
| `whoami` | 返回你自己的角色卡名（走映射）与当前会话 ID。 |

> 工具名含下划线的，在脚本里已显式挂到 `module.exports`，保证宿主逐字查找时能命中。

---

## 配置界面

插件提供 Compose DSL 配置页（工具箱入口，`keepAlive: true`）：

- **账号信息**：显示当前会话 ID、好友模板数、已建实例数，右上角刷新。
- **角色卡名称映射**：为每张卡填自定义显示名，留空 = 不映射；支持一键清空。
- **集合（白名单）**：逐卡开关，决定其能否进市场 / 被添加。全不勾选 = 不限制。
- **保存**：写入 `/storage/emulated/0/Download/Operit/subagent/config.json`。

---

## 项目结构

```
subagent/
├── main.ts                         # 包入口：注册 UI 模块、装配配置界面
├── manifest.json                   # ToolPkg 清单（id / main / subpackages）
├── packages/
│   └── subagent.ts                 # 核心逻辑：工具实现 + METADATA
├── ui/
│   └── config/
│       ├── ConfigState.ts          # 配置页状态持有者（含订阅/通知）
│       └── index.ui.ts             # Compose DSL 配置界面
└── utils/
    ├── ConfigStore.ts              # 配置读写、账号隔离、映射/集合逻辑
    ├── Logger.ts                   # 统一日志出口
    └── PersonalityHelper.ts        # 角色卡拉取（多路径降级 + 缓存）
```

构建产物镜像到 `dist/`：

- `dist/main.js`
- `dist/packages/subagent.js`
- `dist/ui/config/index.ui.js`

---

## 数据流简述

```
AI 调用工具 (add_friend / new / chat ...)
        │
        ▼
packages/subagent.ts   ← 取 currentChatId 作为「我是谁」
        │
        ▼
utils/ConfigStore.ts   ← 读写 config.json，按 chatId 隔离账号
        │
        ▼
Tools.Chat.* (Operit 宿主)  ← 真正的会话创建 / 发消息 / 读历史
```

配置界面：

```
index.ui.ts → ConfigStateHolder → ConfigStore / PersonalityHelper
                    │
                    └─ onChange → setTick → 重渲染
```

---

## 角色卡拉取的多级降级

`PersonalityHelper.fetchAll()` 依次尝试：

1. UI 上下文注入的 `ctx.callTool("list_character_cards")`
2. `Tools.SoftwareSettings.listCharacterCards()`
3. 全局 `toolCall("list_character_cards")`

带 30 秒缓存，`resetPersonalityCache()` 可手动失效。

---

## 配置文件

路径：`/storage/emulated/0/Download/Operit/subagent/config.json`

```jsonc
{
  "version": 3,
  "aliases": { "原始卡名": "自定义名" },
  "collection": ["允许的卡原名"],
  "accounts": {
    "<chatId>": {
      "templates": [
        { "name": "显示名", "cardId": "", "cardName": "卡原名" }
      ],
      "instances": [
        {
          "id": "内部唯一id",
          "name": "显示名",
          "cardId": "",
          "cardName": "卡原名",
          "chatId": "Operit 会话 id",
          "disabled": false,
          "isSelf": false
        }
      ]
    }
  }
}
```

- 版本不匹配（非 `version === 3`）会触发重建，不会崩溃。
- 写入失败、读取异常都会走 `Logger` 输出，不抛出。

---

## 权限与安全

- **账号隔离**：所有 `chat` / `history` 目标先经 `ensureOwned()` 校验，非本账号实例直接拒绝。
- **集合白名单**：`add_friend` 与 `market` 均会校验，集合为空视为放行全部。
- **禁用实例**：`disabled: true` 的实例不出现在 `list`，也不能被 `chat` / `history` 访问。

---

## 开发与调试

### 环境

1. 更新并运行 `SandboxPackage_DEV` 安装脚本。
2. 在 `/sdcard/Download/Operit/dev_package/com.operit.serveryyswys.subagent/` 中开发。
3. 宿主类型位于同级 `/sdcard/Download/Operit/dev_package/types/`。

### 调试安装（推荐）

toolpkg 不适合像单文件脚本那样跑，用专用调试脚本：

```bash
# Linux / macOS
bash tools/toolpkg/debug_toolpkg.sh <你的包目录>

# Windows
tools\toolpkg\debug_toolpkg.bat <你的包目录>
```

它会：读取 `manifest` → 打包 → `adb push` → 广播让 App 重扫 → 按 `toolpkg_id` 启用 → 刷新注册。

### 日志

```bash
adb logcat -s ToolPkg:* PackageManager:* JsEngine:*
```

所有本插件日志前缀为 `[SubAgent]`。

---

## 发布

两条路线二选一：

1. **直接上传当前本地包** —— 适合只发布构建产物，无需 Git 仓库。
2. **引用 GitHub Release 资产** —— 适合长期维护仓库，自行打 tag / Release 后在 Operit 发布页登记。

发布版本取自包内 `manifest.json`，发布页不允许手改。`api_version` 描述所依赖的宿主 ToolPkg API，与包自身 `version` 是两回事。

---

## 许可与鸣谢

MIT License，详见仓库根目录 LICENSE。

Copyright (c) 2026 yyswys-yjyj

本包的设计与代码逻辑来自市场上一个已下架的脚本   
如果您是**sub_agent_manager**的开发者，我们向您致敬。
