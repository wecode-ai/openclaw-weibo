import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { listEnabledWeiboAccounts, resolveWeiboAccount } from "./accounts.js";
import { WeiboSearchSchema, type WeiboSearchParams } from "./search-schema.js";
import { getValidToken } from "./token.js";
import { resolveAnyEnabledWeiboToolsConfig } from "./tools-config.js";
import type { ResolvedWeiboAccount } from "./types.js";

// ============ Helpers ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

// ============ API Types ============

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

const SEARCH_ENDPOINT = "http://10.54.18.236:9011/open/wis/search_by_sid";

async function searchWeibo(
  account: ResolvedWeiboAccount,
  query: string,
  count: number = 20,
  page: number = 1
): Promise<WeiboSearchResponse> {
  const token = await getValidToken(account);

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("access_token", token);
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(Math.min(count, 50)));
  url.searchParams.set("page", String(page));

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

  const result = (await response.json()) as WeiboSearchResponse;
  return result;
}

function formatSearchResult(result: WeiboSearchResponse) {
  const statuses = result.statuses.map((status) => ({
    id: status.id,
    mid: status.mid,
    text: status.text,
    created_at: status.created_at,
    source: status.source,
    user: {
      id: status.user.id,
      screen_name: status.user.screen_name,
      verified: status.user.verified,
      followers_count: status.user.followers_count,
    },
    reposts_count: status.reposts_count,
    comments_count: status.comments_count,
    attitudes_count: status.attitudes_count,
    has_images: (status.pic_urls?.length ?? 0) > 0,
    is_retweet: !!status.retweeted_status,
  }));

  return {
    total_number: result.total_number,
    count: statuses.length,
    statuses,
  };
}

// ============ Tool Registration ============

export function registerWeiboSearchTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("weibo_search: No config available, skipping tool registration");
    return;
  }

  // Check if any account is configured
  const accounts = listEnabledWeiboAccounts(api.config);
  if (accounts.length === 0) {
    api.logger.debug?.("weibo_search: No Weibo accounts configured, skipping tool registration");
    return;
  }

  // Check if search tool is enabled on any account
  const toolsCfg = resolveAnyEnabledWeiboToolsConfig(accounts);
  if (!toolsCfg.search) {
    api.logger.debug?.("weibo_search: Search tool disabled, skipping registration");
    return;
  }

  type ExecuteParams = WeiboSearchParams & { accountId?: string };

  const getAccount = (params: { accountId?: string } | undefined, defaultAccountId?: string) => {
    const accountId = params?.accountId?.trim() || defaultAccountId || "default";
    return resolveWeiboAccount({ cfg: api.config, accountId });
  };

  api.registerTool(
    (ctx) => ({
      name: "weibo_search",
      label: "Weibo Search",
      description:
        "搜索微博内容。返回匹配关键词的微博列表，包含作者信息、互动数据等。",
      parameters: WeiboSearchSchema,
      async execute(_toolCallId, params) {
        const p = params as ExecuteParams;
        try {
          const account = getAccount(p, ctx.agentAccountId);
          if (!account.configured) {
            return json({
              error: `微博账号 "${account.accountId}" 未配置凭据。请在 openclaw.config.json 中配置 channels.weibo.appId 和 channels.weibo.appSecret`,
            });
          }

          const result = await searchWeibo(
            account,
            p.query,
            p.count ?? 20,
            p.page ?? 1
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
  api.logger.info?.("weibo_search: Registered weibo_search tool");
}
