import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { weiboPlugin } from "./src/channel.js";
import { setWeiboRuntime } from "./src/runtime.js";
import { reconnectWeiboMonitor } from "./src/monitor.js";
import { clearClientCache } from "./src/client.js";
import { clearTokenCache } from "./src/token.js";
import { registerWeiboSearchTools } from "./src/search.js";

export { monitorWeiboProvider } from "./src/monitor.js";
export { sendMessageWeibo } from "./src/send.js";
export { weiboPlugin } from "./src/channel.js";

const plugin = {
  id: "weibo",
  name: "Weibo",
  description: "Weibo DM channel plugin",
  configSchema: { type: "object" as const, properties: {} },
  register(api: OpenClawPluginApi) {
    setWeiboRuntime(api.runtime);
    api.registerChannel({ plugin: weiboPlugin });
    registerWeiboSearchTools(api);
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
