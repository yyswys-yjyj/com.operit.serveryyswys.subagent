// utils/Logger.ts
// 统一日志出口，屏蔽宿主差异

export function logInfo(message: string): void {
    try {
        NativeInterface.logInfo("[SubAgent] " + message);
    } catch (e) {
        try { console.log("[SubAgent] " + message); } catch (_e) { /* ignore */ }
    }
}

export function logError(message: string): void {
    try {
        NativeInterface.logError("[SubAgent] " + message);
    } catch (e) {
        try { console.error("[SubAgent] " + message); } catch (_e) { /* ignore */ }
    }
}

export function logDebug(message: string): void {
    try {
        (NativeInterface as any).logDebug("[SubAgent] " + message, "");
    } catch (e) {
        try { console.log("[SubAgent][debug] " + message); } catch (_e) { /* ignore */ }
    }
}
