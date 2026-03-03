import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import type { WeiboConfig, ResolvedWeiboAccount } from "./types.js";

const DEFAULT_ACCOUNT_ID = "default";

export function resolveWeiboAccount({
  cfg,
  accountId = DEFAULT_ACCOUNT_ID,
}: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): ResolvedWeiboAccount {
  const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;

  const isDefault = accountId === DEFAULT_ACCOUNT_ID;

  const DEFAULT_WS_ENDPOINT = "ws://open-im.api.weibo.com/ws/stream";
  const DEFAULT_TOKEN_ENDPOINT = "http://open-im.api.weibo.com/open/auth/ws_token";

  if (isDefault && weiboCfg) {
    const hasCredentials = !!(weiboCfg.appId && weiboCfg.appSecret);
    return {
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: weiboCfg.enabled ?? true,
      configured: hasCredentials,
      name: "Default",
      appId: weiboCfg.appId,
      appSecret: weiboCfg.appSecret,
      wsEndpoint: weiboCfg.wsEndpoint ?? DEFAULT_WS_ENDPOINT,
      tokenEndpoint: weiboCfg.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT,
      config: {
        dmPolicy: weiboCfg.dmPolicy ?? "open",
        allowFrom: weiboCfg.allowFrom ?? [],
        tokenEndpoint: weiboCfg.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT,
        wsEndpoint: weiboCfg.wsEndpoint ?? DEFAULT_WS_ENDPOINT,
        textChunkLimit: weiboCfg.textChunkLimit,
        chunkMode: weiboCfg.chunkMode ?? "newline",
      },
    };
  }

  const accountCfg = weiboCfg?.accounts?.[accountId];
  const topLevel = {
    appId: weiboCfg?.appId,
    appSecret: weiboCfg?.appSecret,
    wsEndpoint: weiboCfg?.wsEndpoint,
    tokenEndpoint: weiboCfg?.tokenEndpoint,
    dmPolicy: weiboCfg?.dmPolicy,
    allowFrom: weiboCfg?.allowFrom,
    textChunkLimit: weiboCfg?.textChunkLimit,
    chunkMode: weiboCfg?.chunkMode,
  };

  const merged = {
    appId: accountCfg?.appId ?? topLevel.appId,
    appSecret: accountCfg?.appSecret ?? topLevel.appSecret,
    wsEndpoint: accountCfg?.wsEndpoint ?? topLevel.wsEndpoint ?? DEFAULT_WS_ENDPOINT,
    tokenEndpoint: accountCfg?.tokenEndpoint ?? topLevel.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT,
    dmPolicy: accountCfg?.dmPolicy ?? topLevel.dmPolicy ?? "open",
    allowFrom: accountCfg?.allowFrom ?? topLevel.allowFrom ?? [],
    textChunkLimit: accountCfg?.textChunkLimit ?? topLevel.textChunkLimit,
    chunkMode: accountCfg?.chunkMode ?? topLevel.chunkMode ?? "newline",
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
