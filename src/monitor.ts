import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedWeiboAccount, WeiboRuntimeStatusPatch } from "./types.js";
import { resolveWeiboAccount, listEnabledWeiboAccounts } from "./accounts.js";
import { clearClientCache, createWeiboClient, WeiboWebSocketClient } from "./client.js";
import { clearTokenCache, formatWeiboTokenFetchErrorMessage } from "./token.js";
import { handleWeiboMessage, type WeiboMessageEvent } from "./bot.js";
import { waitUntilAbortCompat } from "./plugin-sdk-compat.js";

export type MonitorWeiboOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
  statusSink?: (patch: WeiboRuntimeStatusPatch) => void;
};

// Track connections per account
const wsClients = new Map<string, WeiboWebSocketClient>();

async function monitorSingleAccount(params: {
  cfg: ClawdbotConfig;
  account: ResolvedWeiboAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: WeiboRuntimeStatusPatch) => void;
}): Promise<void> {
  const { cfg, account, runtime, abortSignal, statusSink } = params;
  const { accountId } = account;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;
  const emitStatus = (patch: WeiboRuntimeStatusPatch) => statusSink?.(patch);

  log(`weibo[${accountId}]: connecting WebSocket...`);
  emitStatus({
    running: true,
    connected: false,
    connectionState: "connecting",
    lastStartAt: Date.now(),
    lastStopAt: null,
    lastError: null,
  });

  const client = createWeiboClient(account);
  wsClients.set(accountId, client);
  client.onStatus(emitStatus);

  client.onMessage((data) => {
    try {
      const msg = data as { type?: string; payload?: unknown };
      if (msg.type === "message" && msg.payload) {
        emitStatus({ lastInboundAt: Date.now() });
        const event = msg as WeiboMessageEvent;
        handleWeiboMessage({ cfg, event, accountId, runtime }).catch((err) => {
          error(`weibo[${accountId}]: error handling message: ${String(err)}`);
        });
      }
    } catch (err) {
      error(`weibo[${accountId}]: error processing message: ${String(err)}`);
    }
  });

  client.onError((err) => {
    emitStatus({
      running: true,
      connected: false,
      connectionState: "error",
      lastError: err.message,
    });
    error(`weibo[${accountId}]: WebSocket error: ${err.message}`);
  });

  client.onOpen(() => {
    emitStatus({
      running: true,
      connected: true,
      connectionState: "connected",
      reconnectAttempts: 0,
      nextRetryAt: null,
      lastConnectedAt: Date.now(),
      lastError: null,
    });
  });

  client.onClose((code, reason) => {
    emitStatus({
      running: !abortSignal?.aborted,
      connected: false,
      connectionState: abortSignal?.aborted ? "stopped" : "error",
      lastDisconnect: {
        code,
        reason,
        at: Date.now(),
      },
    });
    log(`weibo[${accountId}]: WebSocket closed (code: ${code}, reason: ${reason})`);
    wsClients.delete(accountId);
  });

  // Handle abort signal
  const handleAbort = () => {
    log(`weibo[${accountId}]: abort signal received, closing connection`);
    client.close();
    wsClients.delete(accountId);
    emitStatus({
      running: false,
      connected: false,
      connectionState: "stopped",
      nextRetryAt: null,
      lastStopAt: Date.now(),
    });
  };

  if (abortSignal?.aborted) {
    handleAbort();
    return;
  }

  abortSignal?.addEventListener("abort", handleAbort, { once: true });

  try {
    await client.connect();
    log(`weibo[${accountId}]: WebSocket connected`);
  } catch (err) {
    const message = formatWeiboTokenFetchErrorMessage(err) ?? String(err);
    emitStatus({
      running: true,
      connected: false,
      connectionState: "error",
      lastError: message,
    });
    error(`weibo[${accountId}]: failed to connect: ${message}`);
  }

  // Keep the channel task alive until the gateway aborts it. Returning early here
  // causes the gateway supervisor to interpret startup as an exit and trigger
  // provider auto-restart loops.
  await waitUntilAbortCompat(abortSignal);
}

export async function monitorWeiboProvider(opts: MonitorWeiboOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("Config is required for Weibo monitor");
  }

  const log = opts.runtime?.log ?? console.log;

  // If accountId is specified, only monitor that account
  if (opts.accountId) {
    const account = resolveWeiboAccount({ cfg, accountId: opts.accountId });
    if (!account.enabled || !account.configured) {
      throw new Error(`Weibo account "${opts.accountId}" not configured or disabled`);
    }
    return monitorSingleAccount({
      cfg,
      account,
      runtime: opts.runtime,
      abortSignal: opts.abortSignal,
      statusSink: opts.statusSink,
    });
  }

  // Otherwise, start all enabled accounts
  const accounts = listEnabledWeiboAccounts(cfg);
  if (accounts.length === 0) {
    throw new Error("No enabled Weibo accounts configured");
  }

  log(`weibo: starting ${accounts.length} account(s): ${accounts.map((a) => a.accountId).join(", ")}`);

  // Start all accounts in parallel
  await Promise.all(
    accounts.map((account) =>
      monitorSingleAccount({
        cfg,
        account,
        runtime: opts.runtime,
        abortSignal: opts.abortSignal,
        statusSink: opts.statusSink,
      }),
    ),
  );
}

export function stopWeiboMonitor(accountId?: string): void {
  if (accountId) {
    const client = wsClients.get(accountId);
    if (client) {
      client.close();
      wsClients.delete(accountId);
    }
    clearClientCache(accountId);
    clearTokenCache(accountId);
  } else {
    for (const client of wsClients.values()) {
      client.close();
    }
    wsClients.clear();
    clearClientCache();
    clearTokenCache();
  }
}

export async function reconnectWeiboMonitor(accountId?: string): Promise<void> {
  stopWeiboMonitor(accountId);
}
