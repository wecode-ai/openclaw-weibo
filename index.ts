import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { weiboPlugin } from "./src/channel.js";
import { setWeiboRuntime } from "./src/runtime.js";

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
  },
};

export default plugin;
