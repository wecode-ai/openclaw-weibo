import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { WeiboSendResult } from "./types.js";
import { resolveWeiboAccount } from "./accounts.js";
import { createWeiboClient } from "./client.js";
import { getValidToken, getWeiboApiBaseUrl } from "./token.js";
import { normalizeWeiboTarget } from "./targets.js";

export type SendWeiboMessageParams = {
  cfg: OpenClawConfig;
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

// Stream debug flag — off by default; flip to true locally to trace WS frames.
const STREAM_DEBUG_ENABLED = false;

export async function sendMessageWeibo(params: SendWeiboMessageParams): Promise<WeiboSendResult> {
  const { cfg, to, text, accountId, messageId, chunkId, done } = params;
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
  if (STREAM_DEBUG_ENABLED) {
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

export type SendFileDmWeiboResult = {
  messageId: string;
  chatId: string;
  fid: number;
};

/**
 * Send a file DM via Weibo HTTP API.
 *
 * API: POST /open/dm/send_file?token=xxx&fileName=xxx
 * Body: raw binary file data (application/octet-stream)
 *
 * The recipient (toUid) is resolved server-side from the token.
 * The token encodes both the assistant UID (sender) and the target user UID (recipient).
 *
 * Response: { code: 0, data: { fid: 123456, message_id: "xxx" } }
 */
export async function sendFileDmWeibo(params: {
  cfg: OpenClawConfig;
  to: string;
  buffer: Buffer;
  fileName: string;
  accountId?: string;
}): Promise<SendFileDmWeiboResult> {
  const { cfg, to, buffer, fileName, accountId } = params;
  const account = resolveWeiboAccount({ cfg, accountId });

  if (!account.configured) {
    throw new Error(`Weibo account "${account.accountId}" not configured`);
  }

  const receiveId = normalizeWeiboTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Weibo target: ${to}`);
  }

  const token = await getValidToken(account, account.tokenEndpoint);

  const url = new URL("/open/dm/send_file", getWeiboApiBaseUrl(account.tokenEndpoint));
  url.searchParams.set("token", token);
  url.searchParams.set("fileName", fileName);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(
      `Weibo send_file HTTP error: ${response.status} ${response.statusText}`
    );
  }

  const result = (await response.json()) as {
    code: number;
    message?: string;
    data?: { fid?: number; message_id?: string };
  };

  if (result.code !== 0) {
    throw new Error(
      `Weibo send_file failed: code=${result.code} message=${result.message ?? "unknown"}`
    );
  }

  const messageId = result.data?.message_id;
  const fid = result.data?.fid;

  if (!messageId || typeof fid !== "number") {
    throw new Error(
      "Weibo send_file returned success but omitted required data.message_id or data.fid"
    );
  }

  return {
    messageId,
    chatId: receiveId,
    fid,
  };
}