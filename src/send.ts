import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import type { WeiboSendResult } from "./types.js";
import { resolveWeiboAccount } from "./accounts.js";
import { createWeiboClient } from "./client.js";
import { normalizeWeiboTarget } from "./targets.js";

export type SendWeiboMessageParams = {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  accountId?: string;
  messageId?: string;
  chunkId?: number;
  done?: boolean;
};

export function generateWeiboMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeChunkId(chunkId?: number): number {
  if (typeof chunkId !== "number" || !Number.isFinite(chunkId) || chunkId < 0) {
    return 0;
  }
  return Math.floor(chunkId);
}

export async function sendMessageWeibo(params: SendWeiboMessageParams): Promise<WeiboSendResult> {
  const { cfg, to, text, accountId, messageId, chunkId, done } = params;
  const streamDebugEnabled = process.env.WEIBO_STREAM_DEBUG === "1";
  const account = resolveWeiboAccount({ cfg, accountId });

  if (!account.configured) {
    throw new Error(`Weibo account "${account.accountId}" not configured`);
  }

  const client = createWeiboClient(account);
  const receiveId = normalizeWeiboTarget(to);

  if (!receiveId) {
    throw new Error(`Invalid Weibo target: ${to}`);
  }

  const userId = receiveId.replace(/^user:/, "");
  const outboundMessageId = typeof messageId === "string" && messageId.trim()
    ? messageId.trim()
    : generateWeiboMessageId();
  const outboundChunkId = normalizeChunkId(chunkId);
  const outboundDone = typeof done === "boolean" ? done : true;

  client.send({
    type: "send_message",
    payload: {
      toUserId: userId,
      text: text ?? "",
      messageId: outboundMessageId,
      chunkId: outboundChunkId,
      done: outboundDone,
    },
  });
  if (streamDebugEnabled) {
    console.log(
      `[weibo][stream-debug] ws_send ${JSON.stringify({
        toUserId: userId,
        messageId: outboundMessageId,
        chunkId: outboundChunkId,
        done: outboundDone,
        textLen: (text ?? "").length,
        preview: (text ?? "").slice(0, 80),
      })}`,
    );
  }

  return {
    messageId: outboundMessageId,
    chatId: receiveId,
    chunkId: outboundChunkId,
    done: outboundDone,
  };
}
