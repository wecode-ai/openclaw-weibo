import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { WeiboMessageContext } from "./types.js";
import { resolveWeiboAccount } from "./accounts.js";
import { resolveWeiboAllowlistMatch } from "./policy.js";

// Simple in-memory dedup
const processedMessages = new Set<string>();

function isDuplicate(messageId: string): boolean {
  if (processedMessages.has(messageId)) {
    return true;
  }
  processedMessages.add(messageId);
  // Cleanup old entries periodically
  if (processedMessages.size > 1000) {
    const toDelete = Array.from(processedMessages).slice(0, 500);
    toDelete.forEach((id) => processedMessages.delete(id));
  }
  return false;
}

export type WeiboMessageEvent = {
  type: "message";
  payload: {
    messageId: string;
    fromUserId: string;
    text: string;
    timestamp?: number;
  };
};

export type HandleWeiboMessageParams = {
  cfg: ClawdbotConfig;
  event: WeiboMessageEvent;
  accountId: string;
  runtime?: RuntimeEnv;
};

export async function handleWeiboMessage(params: HandleWeiboMessageParams): Promise<WeiboMessageContext | null> {
  const { cfg, event, accountId, runtime } = params;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const account = resolveWeiboAccount({ cfg, accountId });
  if (!account.enabled || !account.configured) {
    error(`weibo[${accountId}]: account not enabled or configured`);
    return null;
  }

  const { messageId, fromUserId, text, timestamp } = event.payload;

  // Deduplication
  if (isDuplicate(messageId)) {
    return null;
  }

  // Check allowlist
  const isAllowed = resolveWeiboAllowlistMatch({
    userId: fromUserId,
    allowFrom: account.config.allowFrom ?? [],
  });

  if (!isAllowed) {
    log(`weibo[${accountId}]: message from ${fromUserId} not in allowlist`);
    // Return null to indicate message should not be processed
    // OpenClaw framework will handle pairing request
    return null;
  }

  // Build and return message context
  const messageContext: WeiboMessageContext = {
    messageId,
    senderId: fromUserId,
    text: text ?? "",
    createTime: timestamp,
  };

  log(`weibo[${accountId}]: received message from ${fromUserId}`);

  return messageContext;
}
