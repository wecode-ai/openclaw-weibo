import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedWeiboAccount } from "./types.js";
import { resolveWeiboAccount, listEnabledWeiboAccounts } from "./accounts.js";
import { createWeiboClient, WeiboWebSocketClient } from "./client.js";
import { handleWeiboMessage, type WeiboMessageEvent } from "./bot.js";

export type MonitorWeiboOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

// Track connections per account
const wsClients = new Map<string, WeiboWebSocketClient>();

async function monitorSingleAccount(params: {
  cfg: ClawdbotConfig;
  account: ResolvedWeiboAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { cfg, account, runtime, abortSignal } = params;
  const { accountId } = account;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  log(`weibo[${accountId}]: connecting WebSocket...`);

  const client = createWeiboClient(account);
  wsClients.set(accountId, client);

  client.onMessage((data) => {
    try {
      const msg = data as { type?: string; payload?: unknown };
      if (msg.type === "message" && msg.payload) {
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
    error(`weibo[${accountId}]: WebSocket error: ${err.message}`);
  });

  client.onClose((code, reason) => {
    log(`weibo[${accountId}]: WebSocket closed (code: ${code}, reason: ${reason})`);
    wsClients.delete(accountId);
  });

  // Handle abort signal
  const handleAbort = () => {
    log(`weibo[${accountId}]: abort signal received, closing connection`);
    client.close();
    wsClients.delete(accountId);
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
    error(`weibo[${accountId}]: failed to connect: ${String(err)}`);
    wsClients.delete(accountId);
    throw err;
  }

  // Keep connection alive
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (abortSignal?.aborted || !wsClients.has(accountId)) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 1000);
  });
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
    return monitorSingleAccount({ cfg, account, runtime: opts.runtime, abortSignal: opts.abortSignal });
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
  } else {
    for (const client of wsClients.values()) {
      client.close();
    }
    wsClients.clear();
  }
}
