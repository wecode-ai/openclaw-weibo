import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { weiboPlugin } from "./src/channel.js";
import { setWeiboRuntime } from "./src/runtime.js";
import { reconnectWeiboMonitor } from "./src/monitor.js";
import { clearClientCache } from "./src/client.js";
import { clearTokenCache } from "./src/token.js";
import { registerWeiboSearchTools } from "./src/weibo-search.js";
import { registerWeiboStatusTools } from "./src/weibo-status.js";
import { registerWeiboHotSearchTools } from "./src/weibo-hot-search.js";
import { registerWeiboTokenTools } from "./src/weibo-token-tool.js";

export { monitorWeiboProvider } from "./src/monitor.js";
export { sendMessageWeibo } from "./src/send.js";
export { weiboPlugin } from "./src/channel.js";

const plugin = {
  id: "weibo-openclaw-plugin",
  name: "Weibo",
  description: "Weibo DM channel plugin",
  configSchema: { type: "object" as const, properties: {} },
  register(api: OpenClawPluginApi) {
    setWeiboRuntime(api.runtime);
    api.registerChannel({ plugin: weiboPlugin });
    registerWeiboTokenTools(api);
    registerWeiboSearchTools(api);
    registerWeiboStatusTools(api);
    registerWeiboHotSearchTools(api);

    // 工具调用钩子
    api.on("before_tool_call", (event) => {
        if (event.toolName.startsWith("weibo_")) {
            console.log(`[微博工具调用] ${event.toolName} 参数: ${JSON.stringify(event.params)}`);
        }
    });
    api.on("after_tool_call", (event) => {
        if (event.toolName.startsWith("weibo_")) {
            if (event.error) {
                console.error(`[微博工具调用失败] ${event.toolName} 错误: ${event.error}`);
            } else {
                console.log(`[微博工具调用成功] ${event.toolName} 耗时: ${event.durationMs}ms`);
            }
        }
    });

    api.registerGatewayMethod("weibo.reconnect", async ({ params, respond, context }) => {
      const accountId =
        typeof params.accountId === "string" && params.accountId.trim()
          ? params.accountId.trim()
          : undefined;

      try {
        await reconnectWeiboMonitor(accountId);
        clearClientCache(accountId);
        clearTokenCache(accountId);
        await context.stopChannel("weibo", accountId);
        await context.startChannel("weibo", accountId);
        respond(true, { ok: true, accountId: accountId ?? "default" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        respond(false, undefined, {
          code: "weibo_reconnect_failed",
          message,
        });
      }
    });
  },
};

export default plugin;
