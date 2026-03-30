import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { Type, type Static } from "@sinclair/typebox";
import { getValidWeiboToken, getWeiboTokenConfig } from "./weibo-token-tool.js";

// ============ Schema ============

export const WeiboHotSearchSchema = Type.Object({
  category: Type.String({
    description:
      "榜单类型（中文名称）：主榜、文娱榜、社会榜、生活榜、acg榜、科技榜、体育榜",
    enum: ["主榜", "文娱榜", "社会榜", "生活榜", "acg榜", "科技榜", "体育榜"],
  }),
  count: Type.Optional(
    Type.Number({
      description: "返回条数，范围 1-50，默认为 50",
      minimum: 1,
      maximum: 50,
    })
  ),
});

export type WeiboHotSearchParams = Static<typeof WeiboHotSearchSchema>;

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
 * 热搜榜 API 响应结构
 * API: http://open-im.api.weibo.com/open/weibo/hot_search
 */
export type WeiboHotSearchApiResponse = {
  code: number;
  message: string;
  data: {
    callTime?: string;
    source?: string;
    data: WeiboHotSearchItem[];
  };
};

export type WeiboHotSearchItem = {
  cat: string;
  id: number;
  word: string;
  num: number;
  flag: number;
  app_query_link: string;
  h5_query_link: string;
  flag_link: string;
};

// ============ Category Mapping ============

/**
 * 榜单类型映射：中文名称 -> 内部标识 (sid)
 */
const CATEGORY_MAP: Record<string, string> = {
  主榜: "v_openclaw",
  文娱榜: "v_openclaw_ent",
  社会榜: "v_openclaw_social",
  生活榜: "v_openclaw_live",
  acg榜: "v_openclaw_acg",
  科技榜: "v_openclaw_tech",
  体育榜: "v_openclaw_sport",
};

// ============ Core Functions ============

// 默认热搜端点
const DEFAULT_HOT_SEARCH_ENDPOINT = "http://open-im.api.weibo.com/open/weibo/hot_search";

/**
 * 获取微博热搜榜
 * 使用 token 认证方式访问
 */
async function fetchHotSearch(
  token: string,
  category: string,
  count?: number,
  endpoint?: string
): Promise<WeiboHotSearchApiResponse> {
  const apiEndpoint = endpoint || DEFAULT_HOT_SEARCH_ENDPOINT;

  const url = new URL(apiEndpoint);
  url.searchParams.set("token", token);
  url.searchParams.set("category", category);
  if (count !== undefined) {
    url.searchParams.set("count", String(count));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `获取热搜榜失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  const result = (await response.json()) as WeiboHotSearchApiResponse;
  return result;
}

/**
 * 格式化热搜结果
 */
function formatHotSearchResult(result: WeiboHotSearchApiResponse, category: string) {
  if (result.code !== 0) {
    return {
      success: false,
      error: result.message || "获取热搜榜失败",
    };
  }

  const data = result.data;

  if (!data.data || data.data.length === 0) {
    return {
      success: true,
      category,
      total: 0,
      callTime: data.callTime,
      source: data.source,
      items: [],
      message: "没有找到热搜内容",
    };
  }

  return {
    success: true,
    category,
    total: data.data.length,
    callTime: data.callTime,
    source: data.source,
    items: data.data.map((item) => ({
      rank: item.id,
      word: item.word,
      hotValue: item.num,
      category: item.cat,
      flag: item.flag,
      appLink: item.app_query_link,
      h5Link: item.h5_query_link,
      flagIcon: item.flag_link,
    })),
  };
}

// ============ Configuration Types ============

export type WeiboHotSearchConfig = {
  /** 热搜 API 端点，默认为 open-im.api.weibo.com */
  weiboHotSearchEndpoint?: string;
  /** App ID，用于获取 token */
  appId?: string;
  /** App Secret，用于获取 token */
  appSecret?: string;
  /** Token 端点，默认为 http://open-im.api.weibo.com/open/auth/ws_token */
  tokenEndpoint?: string;
  /** 是否启用热搜工具，默认为 true */
  enabled?: boolean;
};

function getHotSearchConfig(api: OpenClawPluginApi): WeiboHotSearchConfig {
  const weiboCfg = api.config?.channels?.weibo as Record<string, unknown> | undefined;
  return {
    weiboHotSearchEndpoint: readOptionalNonBlankString(weiboCfg?.weiboHotSearchEndpoint),
    appId: readOptionalNonBlankString(weiboCfg?.appId),
    appSecret: readOptionalNonBlankString(weiboCfg?.appSecret),
    tokenEndpoint: readOptionalNonBlankString(weiboCfg?.tokenEndpoint),
    enabled: weiboCfg?.weiboHotSearchEnabled !== false,
  };
}

// ============ Tool Registration ============

export function registerWeiboHotSearchTools(api: OpenClawPluginApi) {
  const cfg = getHotSearchConfig(api);

  // 检查是否禁用了工具
  if (!cfg.enabled) {
    api.logger.debug?.("weibo_hot_search: Tool disabled, skipping registration");
    return;
  }

  // 检查是否配置了认证信息
  if (!cfg.appId || !cfg.appSecret) {
    api.logger.warn?.("weibo_hot_search: appId or appSecret not configured, tool disabled");
    return;
  }

  const appId = cfg.appId;
  const appSecret = cfg.appSecret;

  api.registerTool(
    () => ({
      name: "weibo_hot_search",
      label: "Weibo Hot Search",
      description:
        "获取微博热搜榜。支持多种榜单类型：主榜、文娱榜、社会榜、生活榜、acg榜、科技榜、体育榜。返回热搜词、热度值、排名等信息。使用此工具获取数据后，必须使用查询的榜单类型以及返回的 `callTime` 和 `source` 字段内容注明数据来源, 格式: {category}， 2026-03-12 12:00，来自于微博热搜。",
      parameters: WeiboHotSearchSchema,
      async execute(_toolCallId, params) {
        const p = params as WeiboHotSearchParams;
        try {
          // 验证榜单类型
          if (!CATEGORY_MAP[p.category]) {
            return json({
              success: false,
              error: `无效的榜单类型: ${p.category}。支持的类型: ${Object.keys(CATEGORY_MAP).join("、")}`,
            });
          }

          // 获取有效的 token（使用共享的 token 工具）
          const token = await getValidWeiboToken(
            appId,
            appSecret,
            cfg.tokenEndpoint
          );

          const result = await fetchHotSearch(
            token,
            p.category,
            p.count,
            cfg.weiboHotSearchEndpoint
          );

          return json(formatHotSearchResult(result, p.category));
        } catch (err) {
          return json({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),
    { name: "weibo_hot_search" }
  );
}
