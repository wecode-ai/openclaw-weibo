import type { ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk";
import type { ResolvedWeiboAccount, WeiboConfig } from "./types.js";
import {
  resolveWeiboAccount,
  listWeiboAccountIds,
  resolveDefaultWeiboAccountId,
} from "./accounts.js";
import { weiboOutbound } from "./outbound.js";
import { normalizeWeiboTarget, looksLikeWeiboId } from "./targets.js";
import { sendMessageWeibo } from "./send.js";

const DEFAULT_ACCOUNT_ID = "default";
const PAIRING_APPROVED_MESSAGE = "✓ You have been approved to chat with this agent.";

const meta = {
  id: "weibo",
  label: "Weibo",
  selectionLabel: "Weibo (微博)",
  docsPath: "/channels/weibo",
  docsLabel: "weibo",
  blurb: "Weibo direct message channel.",
  order: 80,
};

export const weiboPlugin: ChannelPlugin<ResolvedWeiboAccount> = {
  id: "weibo",
  meta,

  pairing: {
    idLabel: "weiboUserId",
    normalizeAllowEntry: (entry: string) => entry.replace(/^user:/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      await sendMessageWeibo({
        cfg,
        to: id,
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  },

  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: false,
  },

  agentPrompt: {
    messageToolHints: () => [
      "- Weibo targeting: omit `target` to reply to the current conversation. Explicit targets: `user:userId`.",
    ],
  },

  reload: { configPrefixes: ["channels.weibo"] },

  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: true, title: "启用账号", description: "是否启用此微博账号" },
        appId: { type: "string", title: "App ID", description: "App ID" },
        appSecret: { type: "string", title: "App Secret", description: "App Secret" },
        wsEndpoint: { type: "string", format: "uri", default: "ws://open-im.api.weibo.com/ws/openai", title: "WebSocket 地址", description: "微博 WebSocket 服务地址" },
        tokenEndpoint: { type: "string", format: "uri", default: "http://open-im.api.weibo.com/open/auth/ws_token", title: "Token 服务地址", description: "获取 WebSocket Token 的服务地址" },
        dmPolicy: { type: "string", enum: ["open", "pairing"], default: "open", title: "私信策略", description: "open=允许所有人私信, pairing=仅允许配对用户" },
        allowFrom: { type: "array", items: { type: "string" }, title: "允许列表", description: "允许发送私信的用户 ID 列表（白名单）" },
        textChunkLimit: { type: "integer", minimum: 1, title: "文本分片限制", description: "单条消息最大字符数，超出后自动分片" },
        chunkMode: { type: "string", enum: ["length", "newline"], default: "newline", title: "分片模式", description: "newline=按换行分片, length=按字符数分片" },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean", default: true, title: "启用账号", description: "是否启用此微博账号" },
              name: { type: "string", title: "账号名称", description: "账号显示名称（可选）" },
              appId: { type: "string", title: "App ID", description: "App ID" },
              appSecret: { type: "string", title: "App Secret", description: "App Secret" },
              wsEndpoint: { type: "string", default: "ws://open-im.api.weibo.com/ws/openai", title: "WebSocket 地址", description: "微博 WebSocket 服务地址" },
              tokenEndpoint: { type: "string", default: "http://open-im.api.weibo.com/open/auth/ws_token", title: "Token 服务地址", description: "获取 WebSocket Token 的服务地址" },
              textChunkLimit: { type: "integer", minimum: 1, title: "文本分片限制", description: "单条消息最大字符数，超出后自动分片" },
              chunkMode: { type: "string", enum: ["length", "newline"], default: "newline", title: "分片模式", description: "newline=按换行分片, length=按字符数分片" },
            },
          },
        },
      },
    },
  },

  config: {
    listAccountIds: (cfg: ClawdbotConfig) => listWeiboAccountIds(cfg),
    resolveAccount: (cfg: ClawdbotConfig, accountId?: string | null) =>
      resolveWeiboAccount({ cfg, accountId: accountId ?? DEFAULT_ACCOUNT_ID }),
    defaultAccountId: (cfg: ClawdbotConfig) => resolveDefaultWeiboAccountId(cfg),
    setAccountEnabled: ({
      cfg,
      accountId,
      enabled,
    }: {
      cfg: ClawdbotConfig;
      accountId: string;
      enabled: boolean;
    }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            weibo: {
              ...cfg.channels?.weibo,
              enabled,
            },
          },
        };
      }

      const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          weibo: {
            ...weiboCfg,
            accounts: {
              ...weiboCfg?.accounts,
              [accountId]: {
                ...weiboCfg?.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      };
    },
    deleteAccount: ({
      cfg,
      accountId,
    }: {
      cfg: ClawdbotConfig;
      accountId: string;
    }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).weibo;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }

      const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
      const accounts = { ...weiboCfg?.accounts };
      delete accounts[accountId];

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          weibo: {
            ...weiboCfg,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account: ResolvedWeiboAccount) => account.configured,
    describeAccount: (account: ResolvedWeiboAccount) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appId: account.appId,
    }),
    resolveAllowFrom: ({
      cfg,
      accountId,
    }: {
      cfg: ClawdbotConfig;
      accountId?: string | null;
    }) => {
      const account = resolveWeiboAccount({ cfg, accountId: accountId ?? DEFAULT_ACCOUNT_ID });
      return (account.config?.allowFrom ?? [])
        .map((entry) => String(entry).trim())
        .filter(Boolean);
    },
    formatAllowFrom: ({
      allowFrom,
    }: {
      cfg: ClawdbotConfig;
      accountId?: string | null;
      allowFrom: (string | number)[];
    }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean),
  },

  security: {
    collectWarnings: () => [],
  },

  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({
      cfg,
      accountId,
    }: {
      cfg: ClawdbotConfig;
      accountId?: string;
    }) => {
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            weibo: {
              ...cfg.channels?.weibo,
              enabled: true,
            },
          },
        };
      }

      const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          weibo: {
            ...weiboCfg,
            accounts: {
              ...weiboCfg?.accounts,
              [accountId]: {
                ...weiboCfg?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      };
    },
  },

  messaging: {
    normalizeTarget: (raw: string) => {
      const result = normalizeWeiboTarget(raw);
      return result || undefined;
    },
    targetResolver: {
      looksLikeId: looksLikeWeiboId,
      hint: "<userId>",
    },
  },

  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
    listPeersLive: async () => [],
    listGroupsLive: async () => [],
  },

  outbound: weiboOutbound,

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      port: null,
    },
    buildChannelSummary: ({ snapshot }: { snapshot: Record<string, unknown> }) => ({
      configured: (snapshot.configured as boolean) ?? false,
      running: (snapshot.running as boolean) ?? false,
      lastStartAt: (snapshot.lastStartAt as number | null) ?? null,
      lastStopAt: (snapshot.lastStopAt as number | null) ?? null,
      lastError: (snapshot.lastError as string | null) ?? null,
      port: (snapshot.port as number | null) ?? null,
    }),
    probeAccount: async () => ({ ok: true }),
    buildAccountSnapshot: ({
      account,
      runtime,
    }: {
      account: ResolvedWeiboAccount;
      cfg: ClawdbotConfig;
      runtime?: Record<string, unknown>;
      probe?: unknown;
      audit?: unknown;
    }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appId: account.appId,
      running: (runtime?.running as boolean) ?? false,
      lastStartAt: (runtime?.lastStartAt as number | null) ?? null,
      lastStopAt: (runtime?.lastStopAt as number | null) ?? null,
      lastError: (runtime?.lastError as string | null) ?? null,
      port: (runtime?.port as number | null) ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const { monitorWeiboProvider } = await import("./monitor.js");
      ctx.setStatus({ accountId: ctx.accountId, port: null });
      ctx.log?.info(`starting weibo[${ctx.accountId}] WebSocket`);
      return monitorWeiboProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
      });
    },
  },
};
