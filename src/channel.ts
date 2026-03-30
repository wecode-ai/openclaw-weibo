import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ResolvedWeiboAccount, WeiboConfig } from "./types.js";
import {
  resolveWeiboAccount,
  listWeiboAccountIds,
  resolveDefaultWeiboAccountId,
} from "./accounts.js";
import { weiboOutbound } from "./outbound.js";
import { normalizeWeiboTarget, looksLikeWeiboId } from "./targets.js";
import { sendMessageWeibo } from "./send.js";
import { monitorWeiboProvider } from "./monitor.js";

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
        wsEndpoint: { type: "string", format: "uri", default: "ws://open-im.api.weibo.com/ws/stream", title: "WebSocket 地址", description: "微博 WebSocket 服务地址" },
        tokenEndpoint: { type: "string", format: "uri", default: "http://open-im.api.weibo.com/open/auth/ws_token", title: "Token 服务地址", description: "获取 WebSocket Token 的服务地址" },
        dmPolicy: { type: "string", enum: ["open", "pairing"], default: "open", title: "私信策略", description: "open=允许所有人私信, pairing=仅允许配对用户" },
        allowFrom: { type: "array", items: { type: "string" }, title: "允许列表", description: "允许发送私信的用户 ID 列表（白名单）" },
        textChunkLimit: { type: "integer", minimum: 1, title: "文本分片限制", description: "单条消息最大字符数，超出后自动分片" },
        chunkMode: { type: "string", enum: ["length", "newline", "raw"], default: "raw", title: "分片模式", description: "newline=按段落分片, length=按字符数分片, raw=转发上游分片" },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean", default: true, title: "启用账号", description: "是否启用此微博账号" },
              name: { type: "string", title: "账号名称", description: "账号显示名称（可选）" },
              appId: { type: "string", title: "App ID", description: "App ID" },
              appSecret: { type: "string", title: "App Secret", description: "App Secret" },
              wsEndpoint: { type: "string", default: "ws://open-im.api.weibo.com/ws/stream", title: "WebSocket 地址", description: "微博 WebSocket 服务地址" },
              tokenEndpoint: { type: "string", default: "http://open-im.api.weibo.com/open/auth/ws_token", title: "Token 服务地址", description: "获取 WebSocket Token 的服务地址" },
              textChunkLimit: { type: "integer", minimum: 1, title: "文本分片限制", description: "单条消息最大字符数，超出后自动分片" },
              chunkMode: { type: "string", enum: ["length", "newline", "raw"], default: "raw", title: "分片模式", description: "newline=按段落分片, length=按字符数分片, raw=转发上游分片" },
            },
          },
        },
      },
    },
  },

  config: {
    listAccountIds: (cfg: OpenClawConfig) => listWeiboAccountIds(cfg),
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) =>
      resolveWeiboAccount({ cfg, accountId: accountId ?? DEFAULT_ACCOUNT_ID }),
    defaultAccountId: (cfg: OpenClawConfig) => resolveDefaultWeiboAccountId(cfg),
    setAccountEnabled: ({
      cfg,
      accountId,
      enabled,
    }: {
      cfg: OpenClawConfig;
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
      cfg: OpenClawConfig;
      accountId: string;
    }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        const next = { ...cfg } as OpenClawConfig;
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
      cfg: OpenClawConfig;
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
      cfg: OpenClawConfig;
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
      cfg: OpenClawConfig;
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
      connected: false,
      mode: "idle",
      reconnectAttempts: 0,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastError: null,
      port: null,
    } as never,
    buildChannelSummary: ({ snapshot }: { snapshot: Record<string, unknown> }) => ({
      configured: (snapshot.configured as boolean) ?? false,
      running: (snapshot.running as boolean) ?? false,
      connected: (snapshot.connected as boolean) ?? false,
      connectionState:
        (snapshot.connectionState as string | null)
        ?? (snapshot.mode as string | null)
        ?? null,
      reconnectAttempts: (snapshot.reconnectAttempts as number | null) ?? 0,
      nextRetryAt: (snapshot.nextRetryAt as number | null) ?? null,
      lastConnectedAt: (snapshot.lastConnectedAt as number | null) ?? null,
      lastDisconnect: (snapshot.lastDisconnect as Record<string, unknown> | null) ?? null,
      lastStartAt: (snapshot.lastStartAt as number | null) ?? null,
      lastStopAt: (snapshot.lastStopAt as number | null) ?? null,
      lastInboundAt: (snapshot.lastInboundAt as number | null) ?? null,
      lastOutboundAt: (snapshot.lastOutboundAt as number | null) ?? null,
      lastError: (snapshot.lastError as string | null) ?? null,
      port: (snapshot.port as number | null) ?? null,
    }),
    probeAccount: async () => ({ ok: true }),
    buildAccountSnapshot: ({ account, runtime }) => {
      const runtimeRecord = runtime as Record<string, unknown> | undefined;
      const disconnect = runtime?.lastDisconnect as
        | { at?: unknown; code?: unknown; reason?: unknown }
        | string
        | null
        | undefined;

      return {
        accountId: account.accountId,
        enabled: account.enabled,
        configured: account.configured,
        name: account.name,
        appId: account.appId,
        running: (runtime?.running as boolean) ?? false,
        connected: (runtime?.connected as boolean) ?? false,
        mode:
          (runtimeRecord?.connectionState as string | null)
          ?? (runtime?.mode as string | null)
          ?? null,
        reconnectAttempts: (runtime?.reconnectAttempts as number | null) ?? 0,
        lastConnectedAt: (runtime?.lastConnectedAt as number | null) ?? null,
        lastDisconnect:
          disconnect && typeof disconnect === "object"
            ? {
                at: Number(disconnect.at ?? Date.now()),
                status:
                  typeof disconnect.code === "number" ? disconnect.code : undefined,
                error:
                  typeof disconnect.reason === "string" ? disconnect.reason : undefined,
              }
            : disconnect ?? null,
        lastStartAt: (runtime?.lastStartAt as number | null) ?? null,
        lastStopAt: (runtime?.lastStopAt as number | null) ?? null,
        lastInboundAt: (runtime?.lastInboundAt as number | null) ?? null,
        lastOutboundAt: (runtime?.lastOutboundAt as number | null) ?? null,
        lastError: (runtime?.lastError as string | null) ?? null,
        port: (runtime?.port as number | null) ?? null,
        connectionState:
          (runtimeRecord?.connectionState as string | null)
          ?? (runtime?.mode as string | null)
          ?? null,
        nextRetryAt: (runtimeRecord?.nextRetryAt as number | null) ?? null,
      } as never;
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      ctx.setStatus({
        accountId: ctx.accountId,
        port: null,
        running: true,
        connected: false,
        mode: "connecting",
        lastStartAt: Date.now(),
        lastStopAt: null,
        lastError: null,
      } as never);
      ctx.log?.info(`starting weibo[${ctx.accountId}] WebSocket`);
      return monitorWeiboProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
        statusSink: (patch) =>
          ctx.setStatus({
            accountId: ctx.accountId,
            port: null,
            ...patch,
            mode:
              (patch.connectionState as string | undefined)
              ?? (ctx.getStatus().mode as string | undefined),
          } as never),
      });
    },
  },
};
