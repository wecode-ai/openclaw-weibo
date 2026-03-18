import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type, type Static } from "@sinclair/typebox";

// ============ Schema ============

export const WeiboStatusSchema = Type.Object({
  count: Type.Optional(
    Type.Number({
      description: "每页数量，最大 100，默认 20",
      minimum: 1,
      maximum: 100,
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
 * 用户信息结构（简化版）
 */
export type WeiboStatusUser = {
  screen_name: string;
};

/**
 * 微博状态项结构
 */
export type WeiboStatusItem = {
  /** 微博 ID */
  id: number;
  /** 微博 MID */
  mid: string;
  /** 微博内容 */
  text: string;
  /** 发布时间 */
  created_at: string;
  /** 是否有图片 */
  has_image: boolean;
  /** 图片列表（图片ID数组） */
  images?: string[];
  /** 图片数量 */
  pic_num?: number;
  /** 评论数 */
  comments_count: number;
  /** 转发数 */
  reposts_count: number;
  /** 点赞数 */
  attitudes_count: number;
  /** 用户信息 */
  user: WeiboStatusUser;
  /** 转发的原微博 */
  repost?: WeiboStatusItem;
};

/**
 * 用户微博 API 响应结构
 */
export type WeiboStatusApiResponse = {
  code: number;
  message: string;
  data: {
    statuses: WeiboStatusItem[];
    total_number: number;
  };
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
 */
async function getValidWeiboStatusToken(
  appId: string,
  appSecret: string,
  tokenEndpoint?: string
): Promise<string> {
  if (weiboStatusTokenCache) {
    const expiresAt =
      weiboStatusTokenCache.acquiredAt +
      weiboStatusTokenCache.expiresIn * 1000 -
      TOKEN_REFRESH_BUFFER_SECONDS * 1000;
    if (Date.now() < expiresAt) {
      return weiboStatusTokenCache.token;
    }
  }

  const tokenResult = await fetchWeiboStatusToken(appId, appSecret, tokenEndpoint);
  return tokenResult.token;
}

// ============ Core Functions ============

const DEFAULT_WEIBO_STATUS_ENDPOINT = "http://open-im.api.weibo.com/open/weibo/user_status";

type FetchWeiboStatusOptions = {
  token: string;
  count?: number;
  endpoint?: string;
};

/**
 * 获取用户自己发布的微博
 */
async function fetchWeiboStatus(
  options: FetchWeiboStatusOptions
): Promise<WeiboStatusApiResponse> {
  const apiEndpoint = options.endpoint || DEFAULT_WEIBO_STATUS_ENDPOINT;

  const url = new URL(apiEndpoint);
  url.searchParams.set("token", options.token);
  
  if (options.count !== undefined) {
    url.searchParams.set("count", String(options.count));
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
 * 格式化单条微博
 */
function formatStatusItem(status: WeiboStatusItem) {
  const formatted: Record<string, unknown> = {
    id: status.id,
    mid: status.mid,
    text: status.text,
    createdAt: status.created_at,
    hasImage: status.has_image,
    images: status.images,
    picNum: status.pic_num,
    commentsCount: status.comments_count,
    repostsCount: status.reposts_count,
    attitudesCount: status.attitudes_count,
    user: {
      screenName: status.user.screen_name,
    },
  };

  // 添加转发微博信息
  if (status.repost) {
    formatted.repost = formatStatusItem(status.repost);
  }

  return formatted;
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
    statuses: data.statuses.map(formatStatusItem),
  };
}

// ============ Configuration Types ============

export type WeiboStatusConfig = {
  weiboStatusEndpoint?: string;
  appId?: string;
  appSecret?: string;
  tokenEndpoint?: string;
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

  if (!cfg.enabled) {
    api.logger.debug?.("weibo_status: Tool disabled, skipping registration");
    return;
  }

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
        "获取用户自己发布的微博列表。返回用户发布的微博内容(包含原博内容)、互动数据等信息。",
      parameters: WeiboStatusSchema,
      async execute(_toolCallId, params) {
        const p = params as WeiboStatusParams;
        try {
          const token = await getValidWeiboStatusToken(
            appId,
            appSecret,
            cfg.tokenEndpoint
          );

          const result = await fetchWeiboStatus({
            token,
            count: p.count,
            endpoint: cfg.weiboStatusEndpoint,
          });

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
