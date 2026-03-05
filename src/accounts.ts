import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import type { WeiboConfig, ResolvedWeiboAccount } from "./types.js";

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_WS_ENDPOINT = "ws://open-im.api.weibo.com/ws/stream";
const DEFAULT_TOKEN_ENDPOINT = "http://open-im.api.weibo.com/open/auth/ws_token";

function readOptionalNonBlankString(value: unknown): string | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveWeiboAccount({
  cfg,
  accountId = DEFAULT_ACCOUNT_ID,
}: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): ResolvedWeiboAccount {
  const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;

  const isDefault = accountId === DEFAULT_ACCOUNT_ID;
  const topLevelAppId = readOptionalNonBlankString(weiboCfg?.appId);
  const topLevelAppSecret = readOptionalNonBlankString(weiboCfg?.appSecret);
  const topLevelWsEndpoint = readOptionalNonBlankString(weiboCfg?.wsEndpoint);
  const topLevelTokenEndpoint = readOptionalNonBlankString(weiboCfg?.tokenEndpoint);

  if (isDefault && weiboCfg) {
    const hasCredentials = !!(topLevelAppId && topLevelAppSecret);
    return {
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: weiboCfg.enabled ?? true,
      configured: hasCredentials,
      name: "Default",
      appId: topLevelAppId,
      appSecret: topLevelAppSecret,
      wsEndpoint: topLevelWsEndpoint ?? DEFAULT_WS_ENDPOINT,
      tokenEndpoint: topLevelTokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT,
      config: {
        dmPolicy: weiboCfg.dmPolicy ?? "open",
        allowFrom: weiboCfg.allowFrom ?? [],
        tokenEndpoint: topLevelTokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT,
        wsEndpoint: topLevelWsEndpoint ?? DEFAULT_WS_ENDPOINT,
        textChunkLimit: weiboCfg.textChunkLimit,
        chunkMode: weiboCfg.chunkMode ?? "newline",
        blockStreaming: weiboCfg.blockStreaming ?? true,
      },
    };
  }

  const accountCfg = weiboCfg?.accounts?.[accountId];
  const topLevel = {
    appId: topLevelAppId,
    appSecret: topLevelAppSecret,
    wsEndpoint: topLevelWsEndpoint,
    tokenEndpoint: topLevelTokenEndpoint,
    dmPolicy: weiboCfg?.dmPolicy,
    allowFrom: weiboCfg?.allowFrom,
    textChunkLimit: weiboCfg?.textChunkLimit,
    chunkMode: weiboCfg?.chunkMode,
    blockStreaming: weiboCfg?.blockStreaming,
  };

  const merged = {
    appId: readOptionalNonBlankString(accountCfg?.appId) ?? topLevel.appId,
    appSecret: readOptionalNonBlankString(accountCfg?.appSecret) ?? topLevel.appSecret,
    wsEndpoint:
      readOptionalNonBlankString(accountCfg?.wsEndpoint)
      ?? topLevel.wsEndpoint
      ?? DEFAULT_WS_ENDPOINT,
    tokenEndpoint:
      readOptionalNonBlankString(accountCfg?.tokenEndpoint)
      ?? topLevel.tokenEndpoint
      ?? DEFAULT_TOKEN_ENDPOINT,
    dmPolicy: accountCfg?.dmPolicy ?? topLevel.dmPolicy ?? "open",
    allowFrom: accountCfg?.allowFrom ?? topLevel.allowFrom ?? [],
    textChunkLimit: accountCfg?.textChunkLimit ?? topLevel.textChunkLimit,
    chunkMode: accountCfg?.chunkMode ?? topLevel.chunkMode ?? "newline",
    blockStreaming: accountCfg?.blockStreaming ?? topLevel.blockStreaming ?? true,
  };

  const hasCredentials = !!(merged.appId && merged.appSecret);

  return {
    accountId,
    enabled: accountCfg?.enabled ?? weiboCfg?.enabled ?? true,
    configured: hasCredentials,
    name: accountCfg?.name,
    appId: merged.appId,
    appSecret: merged.appSecret,
    wsEndpoint: merged.wsEndpoint,
    tokenEndpoint: merged.tokenEndpoint,
    config: {
      dmPolicy: merged.dmPolicy,
      allowFrom: merged.allowFrom,
      tokenEndpoint: merged.tokenEndpoint,
      wsEndpoint: merged.wsEndpoint,
      textChunkLimit: merged.textChunkLimit,
      chunkMode: merged.chunkMode,
      blockStreaming: merged.blockStreaming,
    },
  };
}

export function listWeiboAccountIds(cfg: ClawdbotConfig): string[] {
  const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
  const accounts = weiboCfg?.accounts;
  const ids = [DEFAULT_ACCOUNT_ID];
  if (accounts) {
    ids.push(...Object.keys(accounts));
  }
  return ids;
}

export function resolveDefaultWeiboAccountId(cfg: ClawdbotConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function listEnabledWeiboAccounts(cfg: ClawdbotConfig): ResolvedWeiboAccount[] {
  const ids = listWeiboAccountIds(cfg);
  return ids
    .map((id) => resolveWeiboAccount({ cfg, accountId: id }))
    .filter((a) => a.enabled && a.configured);
}
