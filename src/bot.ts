import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { WeiboMessageContext } from "./types.js";
import { resolveWeiboAccount } from "./accounts.js";
import { getWeiboRuntime } from "./runtime.js";

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

  // Get runtime core
  const core = getWeiboRuntime();

  // Build message content
  const content = text ?? "";
  if (!content.trim()) {
    return null;
  }

  // Resolve routing - find which agent should handle this message
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "weibo",
    accountId,
    peer: {
      kind: "direct",
      id: fromUserId,
    },
  });

  if (!route.agentId) {
    log(`weibo[${accountId}]: no agent route found for ${fromUserId}`);
    return null;
  }

  log(`weibo[${accountId}]: received message from ${fromUserId}, routing to ${route.agentId} (session=${route.sessionKey})`);

  // Enqueue system event for logging/monitoring
  const preview = content.replace(/\s+/g, " ").slice(0, 160);
  core.system.enqueueSystemEvent(`Weibo[${accountId}] DM from ${fromUserId}: ${preview}`, {
    sessionKey: route.sessionKey,
    contextKey: `weibo:message:${fromUserId}:${messageId}`,
  });

  // Build the inbound envelope (message body for agent)
  const body = core.channel.reply.formatInboundEnvelope({
    channel: "Weibo",
    from: fromUserId,
    body: content,
    timestamp: timestamp ?? Date.now(),
    sender: { name: fromUserId, id: fromUserId },
  });

  // Resolve text chunking settings
  const textChunkLimit = core.channel.text.resolveTextChunkLimit(cfg, "weibo", accountId, {
    fallbackLimit: account.config.textChunkLimit ?? 4000,
  });
  const chunkMode = core.channel.text.resolveChunkMode(cfg, "weibo", accountId);

  // Build final inbound context
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: content,
    BodyForCommands: content,
    RawBody: content,
    CommandBody: content,
    From: `weibo:${fromUserId}`,
    To: fromUserId,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: fromUserId,
    SenderName: fromUserId,
    SenderId: fromUserId,
    Provider: "weibo" as const,
    Surface: "weibo" as const,
    MessageSid: messageId,
    Timestamp: timestamp ?? Date.now(),
    WasMentioned: true,
    CommandAuthorized: true,
    OriginatingChannel: "weibo" as const,
    OriginatingTo: fromUserId,
  });

  // Create a dispatcher that sends replies back to Weibo
  const { dispatcher, replyOptions, markDispatchIdle } = core.channel.reply.createReplyDispatcherWithTyping({
    deliver: async (reply) => {
      if (reply.text) {
        const { sendMessageWeibo } = await import("./send.js");
        // Chunk text if needed
        for (const chunk of core.channel.text.chunkTextWithMode(reply.text, textChunkLimit, chunkMode)) {
          await sendMessageWeibo({
            cfg,
            to: fromUserId,
            text: chunk,
          });
        }
      }
    },
    onError: (err, info) => {
      error(`weibo[${accountId}] ${info.kind} reply failed: ${String(err)}`);
    },
    onIdle: () => {
      log(`weibo[${accountId}]: reply dispatcher idle`);
    },
  });

  // Dispatch to agent
  log(`weibo[${accountId}]: dispatching to agent (session=${route.sessionKey})`);

  try {
    const result = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();

    log(`weibo[${accountId}]: dispatch complete (queuedFinal=${result.queuedFinal}, replies=${result.counts.final})`);
  } catch (err) {
    error(`weibo[${accountId}]: failed to dispatch message: ${String(err)}`);
    markDispatchIdle();
  }

  // Build and return message context
  const messageContext: WeiboMessageContext = {
    messageId,
    senderId: fromUserId,
    text: content,
    createTime: timestamp,
  };

  return messageContext;
}
