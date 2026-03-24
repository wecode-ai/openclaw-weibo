import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let weiboRuntime: PluginRuntime | undefined;

export function setWeiboRuntime(runtime: PluginRuntime): void {
  weiboRuntime = runtime;
}

export function getWeiboRuntime(): PluginRuntime {
  if (!weiboRuntime) {
    throw new Error("Weibo runtime not initialized");
  }
  return weiboRuntime;
}
