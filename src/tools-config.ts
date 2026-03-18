import type { WeiboToolsConfig } from "./types.js";

export type ResolvedWeiboToolsConfig = Required<{
  search: boolean;
  myWeibo: boolean;
  hotSearch: boolean;
}>;

const DEFAULT_TOOLS_CONFIG: ResolvedWeiboToolsConfig = {
  search: true, // Search enabled by default
  myWeibo: true, // My weibo enabled by default
  hotSearch: true, // Hot search enabled by default
};

/**
 * Resolve tools configuration with defaults.
 * Missing values default to true (enabled).
 */
export function resolveToolsConfig(
  tools: WeiboToolsConfig | undefined
): ResolvedWeiboToolsConfig {
  if (!tools) {
    return { ...DEFAULT_TOOLS_CONFIG };
  }
  return {
    search: tools.search ?? DEFAULT_TOOLS_CONFIG.search,
    myWeibo: tools.myWeibo ?? DEFAULT_TOOLS_CONFIG.myWeibo,
    hotSearch: tools.hotSearch ?? DEFAULT_TOOLS_CONFIG.hotSearch,
  };
}

/**
 * Check if any account has a specific tool enabled.
 * Used to determine whether to register a tool at all.
 */
export function resolveAnyEnabledWeiboToolsConfig(
  accounts: Array<{ config: { tools?: WeiboToolsConfig } }>
): ResolvedWeiboToolsConfig {
  const merged: ResolvedWeiboToolsConfig = {
    search: false,
    myWeibo: false,
    hotSearch: false,
  };
  for (const account of accounts) {
    const cfg = resolveToolsConfig(account.config.tools);
    merged.search = merged.search || cfg.search;
    merged.myWeibo = merged.myWeibo || cfg.myWeibo;
    merged.hotSearch = merged.hotSearch || cfg.hotSearch;
  }
  // If no accounts have explicit config, use defaults
  if (accounts.length === 0) {
    return { ...DEFAULT_TOOLS_CONFIG };
  }
  return merged;
}
