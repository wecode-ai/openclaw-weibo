import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { WeiboSearchSchema, type WeiboSearchParams } from "./search-schema.js";
import { getValidWeiboToken, getWeiboTokenConfig } from "./weibo-token-tool.js";

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

// ============ API Types ============

/**
 * 微博搜索 API 响应结构
 * API: http://open-im.api.weibo.com/open/wis/search_query
 */
export type WeiboSearchApiResponse = {
  code: number;
  message: string;
  data: {
    analyzing: boolean;
    completed: boolean;
    msg: string;
    msg_format: string;
    msg_json: string;
    noContent: boolean;
    profile_image_url: string;
    reference_num: number;
    refused: boolean;
    scheme: string;
    status: number;
    status_stage: number;
    version: string;
    callTime?: string;
    source?: string;
  };
};
// 保留旧类型以兼容可能的其他 API 格式
export type WeiboSearchStatusItem = {
  id: string;
  mid: string;
  text: string;
  source: string;
  created_at: string;
  user: {
    id: string;
    screen_name: string;
    profile_image_url: string;
    followers_count: number;
    friends_count: number;
    statuses_count: number;
    verified: boolean;
    verified_type: number;
    description: string;
  };
  reposts_count: number;
  comments_count: number;
  attitudes_count: number;
  pic_urls?: Array<{ thumbnail_pic: string }>;
  retweeted_status?: WeiboSearchStatusItem;
};

export type WeiboSearchResponse = {
  statuses: WeiboSearchStatusItem[];
  total_number: number;
  previous_cursor: number;
  next_cursor: number;
};

// ============ Core Functions ============

// 默认搜索端点
const DEFAULT_SEARCH_ENDPOINT = "http://open-im.api.weibo.com/open/wis/search_query";

/**
 * 搜索微博内容
 * 使用 token 认证方式访问
 */
async function searchWeibo(
  query: string,
  token: string,
  weiboSearchEndpoint?: string
): Promise<WeiboSearchApiResponse> {
  const endpoint = weiboSearchEndpoint || DEFAULT_SEARCH_ENDPOINT;

  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `微博搜索失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  const result = (await response.json()) as WeiboSearchApiResponse;
  return result;
}

/**
 * 格式化搜索结果
 */
function formatSearchResult(result: WeiboSearchApiResponse) {
  if (result.code !== 0) {
    return {
      success: false,
      error: result.message || "搜索失败",
    };
  }

  const data = result.data;

  // 如果没有内容
  if (data.noContent) {
    return {
      success: true,
      completed: data.completed,
      noContent: true,
      callTime: data.callTime,
      source: data.source,
      message: "没有找到相关内容",
    };
  }

  // 如果被拒绝
  if (data.refused) {
    return {
      success: false,
      error: "搜索请求被拒绝",
    };
  }

  return {
    success: true,
    completed: data.completed,
    analyzing: data.analyzing,
    content: data.msg,
    contentFormat: data.msg_format,
    referenceCount: data.reference_num,
    scheme: data.scheme,
    version: data.version,
    callTime: data.callTime,
    source: data.source,
  };
}

// ============ Configuration Types ============

export type WeiboSearchConfig = {
  /** 搜索 API 端点，默认为 open-im.api.weibo.com */
  weiboSearchEndpoint?: string;
  /** App ID，用于获取 token */
  appId?: string;
  /** App Secret，用于获取 token */
  appSecret?: string;
  /** Token 端点，默认为 http://open-im.api.weibo.com/open/auth/ws_token */
  tokenEndpoint?: string;
  /** 是否启用搜索工具，默认为 true */
  enabled?: boolean;
};

function getSearchConfig(api: OpenClawPluginApi): WeiboSearchConfig {
  const weiboCfg = api.config?.channels?.weibo as Record<string, unknown> | undefined;
  return {
    weiboSearchEndpoint: readOptionalNonBlankString(weiboCfg?.weiboSearchEndpoint),
    appId: readOptionalNonBlankString(weiboCfg?.appId),
    appSecret: readOptionalNonBlankString(weiboCfg?.appSecret),
    tokenEndpoint: readOptionalNonBlankString(weiboCfg?.tokenEndpoint),
    enabled: weiboCfg?.weiboSearchEnabled !== false,
  };
}

// ============ Tool Registration ============

export function registerWeiboSearchTools(api: OpenClawPluginApi) {
  const searchCfg = getSearchConfig(api);

  // 检查是否禁用了搜索工具
  if (!searchCfg.enabled) {
    api.logger.debug?.("weibo_search: Search tool disabled, skipping registration");
    return;
  }

  // 检查是否配置了认证信息
  if (!searchCfg.appId || !searchCfg.appSecret) {
    api.logger.warn?.("weibo_search: appId or appSecret not configured, search tool disabled");
    return;
  }

  const appId = searchCfg.appId;
  const appSecret = searchCfg.appSecret;

  api.registerTool(
    () => ({
      name: "weibo_search",
      label: "Weibo Search",
      description:
        "微博智搜工具，通过关键词获取微博智搜内容。使用此工具获取数据后，必须使用查询关键词以及返回的 `callTime` 和 `source` 字段内容注明数据来源, 格式: 关键词: {query}， 2026-03-12 12:00，来自于微博智搜。查询结果可直接使用",
      parameters: WeiboSearchSchema,
      async execute(_toolCallId, params) {
        const p = params as WeiboSearchParams;
        try {
          // 获取有效的 token（使用共享的 token 工具）
          const token = await getValidWeiboToken(
            appId,
            appSecret,
            searchCfg.tokenEndpoint
          );

          const result = await searchWeibo(
            p.query,
            token,
            searchCfg.weiboSearchEndpoint
          );

          return json(formatSearchResult(result));
        } catch (err) {
          return json({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),
    { name: "weibo_search" }
  );
}
