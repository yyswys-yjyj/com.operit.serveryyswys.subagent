/**
 * Copyright (c) 2026 yyswys-yjyj
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// packageId: com.operit.serveryyswys.subagent

import { logInfo, logError } from "./utils/Logger";

// UI 模块路径（相对「包根目录』解析，即 manifest.json 所在层）
const SCREEN_REF = "dist/ui/config/index.ui.js";

function registerToolPkg(): boolean {
    logInfo("开始注册 智能子代理");
    try {
        // 工具箱配置界面：绑定角色卡
        (ToolPkg as any).registerToolboxUiModule({
            id: "subagent_config",
            runtime: "compose_dsl",
            screen: SCREEN_REF,
            params: {},
            title: {
                zh: "智能子代理配置",
                en: "Sub-Agent Config"
            },
            keepAlive: true
        });

        logInfo("注册完成");
        return true;
    } catch (e) {
        logError("注册失败: " + (e as any).message);
        return false;
    }
}

exports.registerToolPkg = registerToolPkg;