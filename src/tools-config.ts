import type { WeiboToolsConfig } from "./types.js";

export type ResolvedWeiboToolsConfig = Required<{
  search: boolean;
}>;

const DEFAULT_TOOLS_CONFIG: ResolvedWeiboToolsConfig = {
  search: true, // Search enabled by default
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
  };
  for (const account of accounts) {
    const cfg = resolveToolsConfig(account.config.tools);
    merged.search = merged.search || cfg.search;
  }
  // If no accounts have explicit config, use defaults
  if (accounts.length === 0) {
    return { ...DEFAULT_TOOLS_CONFIG };
  }
  return merged;
}
