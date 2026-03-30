import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { Type, type Static } from "@sinclair/typebox";

// ============ Schema ============

export const WeiboTokenSchema = Type.Object({});

export type WeiboTokenParams = Static<typeof WeiboTokenSchema>;

// ============ Helpers ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

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

// ============ Token Management ============

// Token 过期时间：2小时（7200秒），提前60秒刷新
const TOKEN_EXPIRE_SECONDS = 7200;
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

// 默认 token 端点
const DEFAULT_TOKEN_ENDPOINT = "http://open-im.api.weibo.com/open/auth/ws_token";

export type WeiboTokenCache = {
  token: string;
  acquiredAt: number;
  expiresIn: number;
};

type TokenResponse = {
  data: {
    token: string;
    expire_in: number;
  };
};

// 共享的 token 缓存
let sharedTokenCache: WeiboTokenCache | null = null;

/**
 * 获取微博 API token
 * 通过 http://open-im.api.weibo.com/open/auth/ws_token 获取
 * token 过期时间为 2 小时
 */
export async function fetchWeiboToken(
  appId: string,
  appSecret: string,
  tokenEndpoint?: string
): Promise<WeiboTokenCache> {
  const endpoint = tokenEndpoint || DEFAULT_TOKEN_ENDPOINT;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `获取微博 token 失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  const result = (await response.json()) as TokenResponse;

  if (!result.data?.token) {
    throw new Error("获取微博 token 失败: 响应中缺少 token");
  }

  const tokenCache: WeiboTokenCache = {
    token: result.data.token,
    acquiredAt: Date.now(),
    expiresIn: result.data.expire_in || TOKEN_EXPIRE_SECONDS,
  };

  sharedTokenCache = tokenCache;
  return tokenCache;
}

/**
 * 检查 token 是否有效
 */
export function isTokenValid(tokenCache: WeiboTokenCache | null): boolean {
  if (!tokenCache) {
    return false;
  }
  const expiresAt =
    tokenCache.acquiredAt +
    tokenCache.expiresIn * 1000 -
    TOKEN_REFRESH_BUFFER_SECONDS * 1000;
  return Date.now() < expiresAt;
}

/**
 * 获取有效的微博 token
 * 如果缓存的 token 未过期则返回缓存，否则重新获取
 */
export async function getValidWeiboToken(
  appId: string,
  appSecret: string,
  tokenEndpoint?: string
): Promise<string> {
  // 检查缓存的 token 是否有效
  if (isTokenValid(sharedTokenCache)) {
    return sharedTokenCache!.token;
  }

  // 获取新 token
  const tokenResult = await fetchWeiboToken(appId, appSecret, tokenEndpoint);
  return tokenResult.token;
}

/**
 * 获取当前缓存的 token 信息
 */
export function getCachedToken(): WeiboTokenCache | null {
  return sharedTokenCache;
}

/**
 * 清除 token 缓存
 */
export function clearWeiboTokenCache(): void {
  sharedTokenCache = null;
}

// ============ Configuration Types ============

export type WeiboTokenConfig = {
  /** App ID，用于获取 token */
  appId?: string;
  /** App Secret，用于获取 token */
  appSecret?: string;
  /** Token 端点，默认为 http://open-im.api.weibo.com/open/auth/ws_token */
  tokenEndpoint?: string;
  /** 是否启用 token 工具，默认为 true */
  enabled?: boolean;
};

export function getWeiboTokenConfig(api: OpenClawPluginApi): WeiboTokenConfig {
  const weiboCfg = api.config?.channels?.weibo as Record<string, unknown> | undefined;
  return {
    appId: readOptionalNonBlankString(weiboCfg?.appId),
    appSecret: readOptionalNonBlankString(weiboCfg?.appSecret),
    tokenEndpoint: readOptionalNonBlankString(weiboCfg?.tokenEndpoint),
    enabled: weiboCfg?.weiboTokenEnabled !== false,
  };
}

// ============ Tool Registration ============

export function registerWeiboTokenTools(api: OpenClawPluginApi) {
  const cfg = getWeiboTokenConfig(api);

  // 检查是否禁用了工具
  if (!cfg.enabled) {
    api.logger.debug?.("weibo_token: Tool disabled, skipping registration");
    return;
  }

  // 检查是否配置了认证信息
  if (!cfg.appId || !cfg.appSecret) {
    api.logger.warn?.("weibo_token: appId or appSecret not configured, tool disabled");
    return;
  }

  const appId = cfg.appId;
  const appSecret = cfg.appSecret;

  api.registerTool(
    () => ({
      name: "weibo_token",
      label: "Weibo Token",
      description:
        "获取微博 API 访问令牌。返回当前有效的 token 信息，包括 token 值、获取时间和过期时间。如果缓存的 token 已过期，会自动获取新的 token。",
      parameters: WeiboTokenSchema,
      async execute(_toolCallId, _params) {
        try {
          // 获取有效的 token
          const token = await getValidWeiboToken(
            appId,
            appSecret,
            cfg.tokenEndpoint
          );

          const cachedInfo = getCachedToken();

          return json({
            success: true,
            token,
            acquiredAt: cachedInfo?.acquiredAt
              ? new Date(cachedInfo.acquiredAt).toISOString()
              : undefined,
            expiresIn: cachedInfo?.expiresIn,
            expiresAt: cachedInfo
              ? new Date(cachedInfo.acquiredAt + cachedInfo.expiresIn * 1000).toISOString()
              : undefined,
          });
        } catch (err) {
          return json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),
    { name: "weibo_token" }
  );
}
