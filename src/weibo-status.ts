import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type, type Static } from "@sinclair/typebox";

// ============ Schema ============

export const WeiboStatusSchema = Type.Object({
  count: Type.Optional(
    Type.Number({
      description: "返回的微博数量，默认为 20",
      minimum: 1,
      maximum: 100,
    })
  ),
  page: Type.Optional(
    Type.Number({
      description: "页码，默认为 1",
      minimum: 1,
    })
  ),
});

export type WeiboStatusParams = Static<typeof WeiboStatusSchema>;

// ============ Helpers ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

// ============ API Types ============

/**
 * 用户微博 API 响应结构
 * API: http://10.54.18.236:9011/open/status/user_timeline
 */
export type WeiboStatusApiResponse = {
  code: number;
  message: string;
  data: {
    statuses: WeiboStatusItem[];
    total_number: number;
    previous_cursor: number;
    next_cursor: number;
  };
};

export type WeiboStatusItem = {
  id: string;
  mid: string;
  text: string;
  source: string;
  created_at: string;
  reposts_count: number;
  comments_count: number;
  attitudes_count: number;
  pic_urls?: Array<{ thumbnail_pic: string }>;
  retweeted_status?: WeiboStatusItem;
};

// ============ Token Management ============

// Token 过期时间：2小时（7200秒），提前60秒刷新
const TOKEN_EXPIRE_SECONDS = 7200;
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

// 默认 token 端点
const DEFAULT_TOKEN_ENDPOINT = "http://open-im.api.weibo.com/open/auth/ws_token";

type WeiboStatusTokenCache = {
  token: string;
  acquiredAt: number;
  expiresIn: number;
};

// 专用的 token 缓存
let weiboStatusTokenCache: WeiboStatusTokenCache | null = null;

type TokenResponse = {
  data: {
    token: string;
    expire_in: number;
  };
};

/**
 * 获取 token
 * 通过 http://open-im.api.weibo.com/open/auth/ws_token 获取
 * token 过期时间为 2 小时
 */
async function fetchWeiboStatusToken(
  appId: string,
  appSecret: string,
  tokenEndpoint?: string
): Promise<WeiboStatusTokenCache> {
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
      `获取 token 失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  const result = (await response.json()) as TokenResponse;

  if (!result.data?.token) {
    throw new Error("获取 token 失败: 响应中缺少 token");
  }

  const tokenCache: WeiboStatusTokenCache = {
    token: result.data.token,
    acquiredAt: Date.now(),
    expiresIn: result.data.expire_in || TOKEN_EXPIRE_SECONDS,
  };

  weiboStatusTokenCache = tokenCache;
  return tokenCache;
}

/**
 * 获取有效的 token
 * 如果缓存的 token 未过期则返回缓存，否则重新获取
 */
async function getValidWeiboStatusToken(
  appId: string,
  appSecret: string,
  tokenEndpoint?: string
): Promise<string> {
  // 检查缓存的 token 是否有效
  if (weiboStatusTokenCache) {
    const expiresAt =
      weiboStatusTokenCache.acquiredAt +
      weiboStatusTokenCache.expiresIn * 1000 -
      TOKEN_REFRESH_BUFFER_SECONDS * 1000;
    if (Date.now() < expiresAt) {
      return weiboStatusTokenCache.token;
    }
  }

  // 获取新 token
  const tokenResult = await fetchWeiboStatusToken(appId, appSecret, tokenEndpoint);
  return tokenResult.token;
}

// ============ Core Functions ============

// 默认端点
const DEFAULT_WEIBO_STATUS_ENDPOINT = "http://10.54.18.236:9011/open/status/user_timeline";

/**
 * 获取用户自己发布的微博
 * 使用 token 认证方式访问
 */
async function fetchWeiboStatus(
  token: string,
  count?: number,
  page?: number,
  endpoint?: string
): Promise<WeiboStatusApiResponse> {
  const apiEndpoint = endpoint || DEFAULT_WEIBO_STATUS_ENDPOINT;

  const url = new URL(apiEndpoint);
  url.searchParams.set("token", token);
  if (count !== undefined) {
    url.searchParams.set("count", String(count));
  }
  if (page !== undefined) {
    url.searchParams.set("page", String(page));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `获取用户微博失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  const result = (await response.json()) as WeiboStatusApiResponse;
  return result;
}

/**
 * 格式化结果
 */
function formatWeiboStatusResult(result: WeiboStatusApiResponse) {
  if (result.code !== 0) {
    return {
      success: false,
      error: result.message || "获取用户微博失败",
    };
  }

  const data = result.data;

  if (!data.statuses || data.statuses.length === 0) {
    return {
      success: true,
      total: 0,
      statuses: [],
      message: "没有找到微博内容",
    };
  }

  return {
    success: true,
    total: data.total_number,
    previousCursor: data.previous_cursor,
    nextCursor: data.next_cursor,
    statuses: data.statuses.map((status) => ({
      id: status.id,
      mid: status.mid,
      text: status.text,
      source: status.source,
      createdAt: status.created_at,
      repostsCount: status.reposts_count,
      commentsCount: status.comments_count,
      attitudesCount: status.attitudes_count,
      picUrls: status.pic_urls?.map((p) => p.thumbnail_pic),
      hasRetweet: !!status.retweeted_status,
    })),
  };
}

// ============ Configuration Types ============

export type WeiboStatusConfig = {
  /** API 端点，默认为 10.54.18.236:9011 */
  weiboStatusEndpoint?: string;
  /** App ID，用于获取 token */
  appId?: string;
  /** App Secret，用于获取 token */
  appSecret?: string;
  /** Token 端点，默认为 http://open-im.api.weibo.com/open/auth/ws_token */
  tokenEndpoint?: string;
  /** 是否启用工具，默认为 true */
  enabled?: boolean;
};

function getWeiboStatusConfig(api: OpenClawPluginApi): WeiboStatusConfig {
  const weiboCfg = api.config?.channels?.weibo as Record<string, unknown> | undefined;
  return {
    weiboStatusEndpoint: weiboCfg?.weiboStatusEndpoint as string | undefined,
    appId: weiboCfg?.appId as string | undefined,
    appSecret: weiboCfg?.appSecret as string | undefined,
    tokenEndpoint: weiboCfg?.tokenEndpoint as string | undefined,
    enabled: weiboCfg?.weiboStatusEnabled !== false,
  };
}

// ============ Tool Registration ============

export function registerWeiboStatusTools(api: OpenClawPluginApi) {
  const cfg = getWeiboStatusConfig(api);

  // 检查是否禁用了工具
  if (!cfg.enabled) {
    api.logger.debug?.("weibo_status: Tool disabled, skipping registration");
    return;
  }

  // 检查是否配置了认证信息
  if (!cfg.appId || !cfg.appSecret) {
    api.logger.warn?.("weibo_status: appId or appSecret not configured, tool disabled");
    return;
  }

  const appId = cfg.appId;
  const appSecret = cfg.appSecret;

  api.registerTool(
    () => ({
      name: "weibo_status",
      label: "Weibo Status",
      description:
        "获取用户自己发布的微博列表。返回用户发布的微博内容、互动数据等信息。需要 token 认证。",
      parameters: WeiboStatusSchema,
      async execute(_toolCallId, params) {
        const p = params as WeiboStatusParams;
        try {
          // 获取有效的 token
          const token = await getValidWeiboStatusToken(
            appId,
            appSecret,
            cfg.tokenEndpoint
          );

          const result = await fetchWeiboStatus(
            token,
            p.count,
            p.page,
            cfg.weiboStatusEndpoint
          );

          return json(formatWeiboStatusResult(result));
        } catch (err) {
          return json({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),
    { name: "weibo_status" }
  );
  api.logger.info?.("weibo_status: Registered weibo_status tool");
}
