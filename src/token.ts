import type { ResolvedWeiboAccount } from "./types.js";
import { getWeiboTokenFingerprint } from "./fingerprint.js";

export type WeiboTokenResponse = {
  data: {
    token: string;
    expire_in: number;
    uid: number;
  };
};

export type WeiboTokenResult = {
  token: string;
  expiresIn: number;
  acquiredAt: number;
  uid: number;
};

type CachedWeiboTokenResult = WeiboTokenResult & {
  fingerprint: string;
};

const TOKEN_FETCH_BASE_DELAY_MS = 1_000;
const TOKEN_FETCH_MAX_DELAY_MS = 8_000;
const TOKEN_FETCH_MAX_RETRIES = 2;
const RETRYABLE_TOKEN_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

// Token cache per account
const tokenCache = new Map<string, CachedWeiboTokenResult>();

// Default token endpoint - configure in your openclaw.config.json
// Example: tokenEndpoint: "http://localhost:9810/open/auth/ws_token"
const DEFAULT_TOKEN_ENDPOINT = "https://open-im.api.weibo.com/open/auth/ws_token";

export class WeiboTokenFetchError extends Error {
  retryable: boolean;
  status?: number;

  constructor(message: string, options: { retryable: boolean; status?: number }) {
    super(message);
    this.name = "WeiboTokenFetchError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readTokenEndpoint(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_TOKEN_STATUS_CODES.has(status);
}

function toTokenFetchError(err: unknown): WeiboTokenFetchError {
  if (err instanceof WeiboTokenFetchError) {
    return err;
  }
  if (err instanceof Error) {
    return new WeiboTokenFetchError(err.message, { retryable: true });
  }
  return new WeiboTokenFetchError(String(err), { retryable: true });
}

export function formatWeiboTokenFetchErrorMessage(err: unknown): string | null {
  if (!(err instanceof WeiboTokenFetchError)) {
    return null;
  }
  return `获取 token 失败: ${err.message}`;
}

export function isRetryableWeiboTokenFetchError(err: unknown): boolean | null {
  if (!(err instanceof WeiboTokenFetchError)) {
    return null;
  }
  return err.retryable;
}

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

  const endpoint = readTokenEndpoint(tokenEndpoint) ?? DEFAULT_TOKEN_ENDPOINT;
  const fingerprint = getWeiboTokenFingerprint(account, endpoint);

  for (let attempt = 0; ; attempt++) {
    try {
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
        throw new WeiboTokenFetchError(
          `Failed to fetch token: ${response.status} ${response.statusText}`,
          {
            retryable: isRetryableStatus(response.status),
            status: response.status,
          }
        );
      }

      const result = (await response.json()) as WeiboTokenResponse;

      if (!result.data?.token) {
        throw new WeiboTokenFetchError("Invalid token response: missing token", {
          retryable: false,
        });
      }

      const tokenResult: CachedWeiboTokenResult = {
        token: result.data.token,
        uid: result.data.uid,
        expiresIn: result.data.expire_in,
        acquiredAt: Date.now(),
        fingerprint,
      };

      // Cache the token
      tokenCache.set(account.accountId, tokenResult);

      return tokenResult;
    } catch (err) {
      const tokenError = toTokenFetchError(err);
      if (!tokenError.retryable || attempt >= TOKEN_FETCH_MAX_RETRIES) {
        throw tokenError;
      }

      const delay = Math.min(
        TOKEN_FETCH_BASE_DELAY_MS * Math.pow(2, attempt),
        TOKEN_FETCH_MAX_DELAY_MS
      );
      await sleep(delay);
    }
  }
}

export function getCachedToken(
  accountId: string,
  fingerprint?: string
): WeiboTokenResult | undefined {
  const cached = tokenCache.get(accountId);
  if (!cached) return undefined;

  if (fingerprint && cached.fingerprint !== fingerprint) {
    tokenCache.delete(accountId);
    return undefined;
  }

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
  const fingerprint = getWeiboTokenFingerprint(
    account,
    readTokenEndpoint(tokenEndpoint) ?? readTokenEndpoint(account.tokenEndpoint) ?? DEFAULT_TOKEN_ENDPOINT
  );

  // Try to get cached token
  const cached = getCachedToken(account.accountId, fingerprint);
  if (cached) {
    return cached.token;
  }

  // Fetch new token
  const result = await fetchWeiboToken(account, readTokenEndpoint(tokenEndpoint));
  return result.token;
}
