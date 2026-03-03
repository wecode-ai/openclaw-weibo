import type { ResolvedWeiboAccount } from "./types.js";

export type WeiboTokenResponse = {
  data: {
    token: string;
    expire_in: number;
  };
};

export type WeiboTokenResult = {
  token: string;
  expiresIn: number;
  acquiredAt: number;
};

// Token cache per account
const tokenCache = new Map<string, WeiboTokenResult>();

// Default token endpoint - configure in your openclaw.config.json
// Example: tokenEndpoint: "http://localhost:9810/open/auth/ws_token"
const DEFAULT_TOKEN_ENDPOINT = "http://localhost:9810/open/auth/ws_token";

export async function fetchWeiboToken(
  account: ResolvedWeiboAccount,
  tokenEndpoint?: string
): Promise<WeiboTokenResult> {
  const { appId, appSecret } = account;

  if (!appId || !appSecret) {
    throw new Error(`Credentials not configured for account "${account.accountId}"`);
  }

  // Defensive runtime coercion: config may come from untyped sources.
  const normalizedAppId = String(appId);
  const normalizedAppSecret = String(appSecret);

  const endpoint = tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: normalizedAppId,
      app_secret: normalizedAppSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch token: ${response.status} ${response.statusText}`
    );
  }

  const result = (await response.json()) as WeiboTokenResponse;

  if (!result.data?.token) {
    throw new Error("Invalid token response: missing token");
  }

  const tokenResult: WeiboTokenResult = {
    token: result.data.token,
    expiresIn: result.data.expire_in,
    acquiredAt: Date.now(),
  };

  // Cache the token
  tokenCache.set(account.accountId, tokenResult);

  return tokenResult;
}

export function getCachedToken(accountId: string): WeiboTokenResult | undefined {
  const cached = tokenCache.get(accountId);
  if (!cached) return undefined;

  // Check if token is expired (with 60s buffer)
  const expiresAt = cached.acquiredAt + cached.expiresIn * 1000 - 60000;
  if (Date.now() > expiresAt) {
    tokenCache.delete(accountId);
    return undefined;
  }

  return cached;
}

export function clearTokenCache(accountId?: string): void {
  if (accountId) {
    tokenCache.delete(accountId);
  } else {
    tokenCache.clear();
  }
}

export async function getValidToken(
  account: ResolvedWeiboAccount,
  tokenEndpoint?: string
): Promise<string> {
  // Try to get cached token
  const cached = getCachedToken(account.accountId);
  if (cached) {
    return cached.token;
  }

  // Fetch new token
  const result = await fetchWeiboToken(account, tokenEndpoint);
  return result.token;
}
