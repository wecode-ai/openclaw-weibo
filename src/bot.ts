import { createHash } from "node:crypto";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { buildAgentMediaPayloadCompat } from "./plugin-sdk-compat.js";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";

import type {
  WeiboInboundAttachmentPart,
  WeiboMessageContext,
  WeiboResponseContentPart,
  WeiboResponseMessageInputItem,
} from "./types.js";
import { resolveWeiboAccount } from "./accounts.js";
import { createWeiboOutboundStream } from "./outbound-stream.js";
import { getWeiboRuntime } from "./runtime.js";
import { generateWeiboMessageId, sendMessageWeibo } from "./send.js";

// Simple in-memory dedup
const processedMessages = new Set<string>();
const MAX_INBOUND_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INBOUND_FILE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

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

function resolveInboundMessageId(event: WeiboMessageEvent): string {
  const explicitMessageId = event.payload.messageId.trim();
  if (explicitMessageId) {
    return explicitMessageId;
  }

  const digest = createHash("sha1")
    .update(JSON.stringify({
      fromUserId: event.payload.fromUserId,
      text: event.payload.text ?? "",
      timestamp: event.payload.timestamp ?? null,
      input: event.payload.input ?? [],
    }))
    .digest("hex")
    .slice(0, 16);

  return `weibo_inbound_${digest}`;
}

export type WeiboMessageEvent = {
  type: "message";
  payload: {
    messageId: string;
    fromUserId: string;
    text?: string;
    timestamp?: number;
    input?: WeiboResponseMessageInputItem[];
  };
};

export type NormalizedWeiboInboundInput = {
  text: string;
  images: WeiboInboundAttachmentPart[];
  files: WeiboInboundAttachmentPart[];
};

function isSupportedWeiboContentPart(part: unknown): part is WeiboResponseContentPart {
  if (!part || typeof part !== "object") {
    return false;
  }

  const type = (part as { type?: unknown }).type;
  return type === "input_text" || type === "input_image" || type === "input_file";
}

export function normalizeWeiboInboundInput(event: WeiboMessageEvent): NormalizedWeiboInboundInput {
  const textParts: string[] = [];
  const images: WeiboInboundAttachmentPart[] = [];
  const files: WeiboInboundAttachmentPart[] = [];

  for (const item of event.payload.input ?? []) {
    if (item.type !== "message" || item.role !== "user" || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (!isSupportedWeiboContentPart(part)) {
        continue;
      }

      if (part.type === "input_text") {
        if (typeof part.text === "string" && part.text) {
          textParts.push(part.text);
        }
        continue;
      }

      const target = part.type === "input_image" ? images : files;
      target.push({
        mimeType: part.source.media_type,
        filename: part.filename,
        base64: part.source.data,
      });
    }
  }

  const normalizedText = textParts.length > 0
    ? textParts.join("\n")
    : (event.payload.text ?? "");

  return {
    text: normalizedText,
    images,
    files,
  };
}

async function persistWeiboInboundAttachments(params: {
  normalized: NormalizedWeiboInboundInput;
  runtimeCore: ReturnType<typeof getWeiboRuntime>;
  error: (message: string, ...args: unknown[]) => void;
}): Promise<ReturnType<typeof buildAgentMediaPayloadCompat>> {
  const { normalized, runtimeCore, error } = params;
  const mediaList: Array<{ path: string; contentType?: string | null }> = [];

  for (const image of normalized.images) {
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(image.mimeType)) {
      error(`weibo: unsupported image mime type: ${image.mimeType}`);
      continue;
    }

    try {
      const buffer = Buffer.from(image.base64, "base64");
      if (buffer.length === 0) {
        error(`weibo: empty image payload: ${image.filename ?? "unknown"}`);
        continue;
      }

      const saved = await runtimeCore.channel.media.saveMediaBuffer(
        buffer,
        image.mimeType,
        "inbound",
        MAX_INBOUND_IMAGE_BYTES,
        image.filename,
      );

      mediaList.push({
        path: saved.path,
        contentType: saved.contentType,
      });
    } catch (err) {
      error(`weibo: failed to persist image input: ${String(err)}`);
    }
  }

  for (const file of normalized.files) {
    try {
      const buffer = Buffer.from(file.base64, "base64");
      if (buffer.length === 0) {
        error(`weibo: empty file payload: ${file.filename ?? "unknown"}`);
        continue;
      }

      const saved = await runtimeCore.channel.media.saveMediaBuffer(
        buffer,
        file.mimeType,
        "inbound",
        MAX_INBOUND_FILE_BYTES,
        file.filename,
      );

      mediaList.push({
        path: saved.path,
        contentType: saved.contentType,
      });
    } catch (err) {
      error(`weibo: failed to persist file input: ${String(err)}`);
    }
  }

  return buildAgentMediaPayloadCompat(mediaList);
}

export type HandleWeiboMessageParams = {
  cfg: OpenClawConfig;
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

  const { fromUserId, timestamp } = event.payload;
  const messageId = resolveInboundMessageId(event);

  // Deduplication
  if (isDuplicate(messageId)) {
    return null;
  }
  const inboundAcceptedAt = Date.now();
  const streamDebugEnabled = process.env.WEIBO_STREAM_DEBUG === "1";
  const streamDebug = (tag: string, data?: Record<string, unknown>): void => {
    if (!streamDebugEnabled) {
      return;
    }
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    log(`weibo[${accountId}][stream-debug] ${tag}${payload}`);
  };

  // Get runtime core
  const core = getWeiboRuntime();

  // Build message content
  const normalized = normalizeWeiboInboundInput(event);
  const content = normalized.text;
  const hasText = content.trim().length > 0;
  const hasAttachments = normalized.images.length > 0 || normalized.files.length > 0;
  if (!hasText && !hasAttachments) {
    return null;
  }
  const mediaPayload = await persistWeiboInboundAttachments({
    normalized,
    runtimeCore: core,
    error,
  });
  const hasPersistedMedia = Array.isArray(mediaPayload.MediaPaths) && mediaPayload.MediaPaths.length > 0;
  if (!hasText && !hasPersistedMedia) {
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
  const chunkMode = account.config.chunkMode
    ?? core.channel.text.resolveChunkMode(cfg, "weibo", accountId);
  // Weibo real-time streaming is driven by onPartialReply; disable block streaming to avoid duplicate lanes.
  const disableBlockStreaming = true;
  streamDebug("dispatch_init", {
    inboundMessageId: messageId,
    fromUserId,
    chunkMode,
    textChunkLimit,
    configuredBlockStreaming: account.config.blockStreaming,
    disableBlockStreaming,
  });
  let currentOutboundMessageId: string | null = null;
  let currentOutboundChunkId = 0;
  let hasLoggedFirstChunkLatency = false;
  let ensureOutboundMessageIdPromise: Promise<string> | null = null;
  // Queue to serialize outbound chunk sends and prevent chunkId race conditions
  let sendQueueTail: Promise<void> = Promise.resolve();

  const ensureOutboundMessageId = async (): Promise<string> => {
    if (currentOutboundMessageId) {
      return currentOutboundMessageId;
    }
    // Use a shared promise to prevent concurrent initialization race conditions
    if (!ensureOutboundMessageIdPromise) {
      ensureOutboundMessageIdPromise = (async () => {
        currentOutboundMessageId = generateWeiboMessageId();
        currentOutboundChunkId = 0;
        return currentOutboundMessageId;
      })();
    }
    return ensureOutboundMessageIdPromise;
  };

  const sendOutboundChunk = async (params: {
    text: string;
    done: boolean;
    source: "partial" | "deliver" | "settled";
  }): Promise<void> => {
    // Chain this send operation to the queue to ensure sequential chunkId assignment
    const previousTail = sendQueueTail;
    let resolveThis: () => void;
    sendQueueTail = new Promise<void>((resolve) => {
      resolveThis = resolve;
    });

    try {
      // Wait for previous sends to complete before proceeding
      await previousTail;

      const outboundMessageId = await ensureOutboundMessageId();
      const chunkIdForThisSend = currentOutboundChunkId;
      currentOutboundChunkId += 1;

      streamDebug("send_chunk", {
        source: params.source,
        messageId: outboundMessageId,
        chunkId: chunkIdForThisSend,
        done: params.done,
        textLen: params.text.length,
        preview: params.text.slice(0, 80),
      });
      await sendMessageWeibo({
        cfg,
        to: fromUserId,
        text: params.text,
        messageId: outboundMessageId,
        chunkId: chunkIdForThisSend,
        done: params.done,
      });
      if (!hasLoggedFirstChunkLatency && params.text.length > 0) {
        const elapsedMs = Math.max(0, Date.now() - inboundAcceptedAt);
        log(`weibo[${accountId}]: first chunk first-char latency=${elapsedMs}ms`);
        hasLoggedFirstChunkLatency = true;
      }
    } finally {
      resolveThis!();
    }
  };

  const outboundStream = createWeiboOutboundStream({
    chunkMode,
    textChunkLimit,
    emit: sendOutboundChunk,
    chunkTextWithMode: (text, limit, mode) =>
      core.channel.text.chunkTextWithMode(text, limit, mode),
    streamDebug,
  });

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
    ...mediaPayload,
  });

  // Create a dispatcher that sends replies back to Weibo
  const { dispatcher, replyOptions, markDispatchIdle } = core.channel.reply.createReplyDispatcherWithTyping({
    deliver: async (reply, info?: { kind?: string }) => {
      const isFinalDeliver = info?.kind !== "block";
      const before = outboundStream.snapshot();
      streamDebug("deliver_enter", {
        kind: info?.kind ?? "unknown",
        isFinalDeliver,
        textLen: (reply.text ?? "").length,
        ...before,
      });
      await outboundStream.pushDeliverText({
        text: reply.text ?? "",
        isFinal: isFinalDeliver,
      });
      streamDebug("deliver_exit", {
        kind: info?.kind ?? "unknown",
        isFinalDeliver,
        ...outboundStream.snapshot(),
      });
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
    const onSettled = async () => {
      streamDebug("dispatcher_settled_before", {
        currentOutboundMessageId,
        currentOutboundChunkId,
        ...outboundStream.snapshot(),
      });
      await outboundStream.settle();
      streamDebug("dispatcher_settled_after", {
        currentOutboundMessageId,
        currentOutboundChunkId,
        ...outboundStream.snapshot(),
      });
      currentOutboundMessageId = null;
      currentOutboundChunkId = 0;
      ensureOutboundMessageIdPromise = null;
      markDispatchIdle();
    };

    const runDispatch = () => core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions: {
        ...replyOptions,
        disableBlockStreaming,
        onPartialReply: async (payload) => {
          streamDebug("on_partial_reply", {
            textLen: (payload.text ?? "").length,
            preview: (payload.text ?? "").slice(0, 80),
          });
          await outboundStream.pushPartialSnapshot(payload.text ?? "");
        },
        onAssistantMessageStart: () => {
          streamDebug("on_assistant_message_start");
        },
        onReasoningEnd: () => {
          streamDebug("on_reasoning_end");
        },
      },
    });

    const withReplyDispatcher = (core.channel.reply as {
      withReplyDispatcher?: (params: {
        dispatcher: unknown;
        run: () => Promise<{ queuedFinal: boolean; counts: { final: number } }>;
        onSettled?: () => Promise<void> | void;
      }) => Promise<{ queuedFinal: boolean; counts: { final: number } }>;
    }).withReplyDispatcher;

    const result = typeof withReplyDispatcher === "function"
      ? await withReplyDispatcher({
        dispatcher,
        onSettled,
        run: runDispatch,
      })
      : await (async () => {
        try {
          return await runDispatch();
        } finally {
          await onSettled();
        }
      })();

    log(`weibo[${accountId}]: dispatch complete (queuedFinal=${result.queuedFinal}, replies=${result.counts.final})`);
  } catch (err) {
    error(`weibo[${accountId}]: failed to dispatch message: ${String(err)}`);
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
