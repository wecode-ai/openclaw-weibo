import type {
  ChannelOutboundAdapter,
  ChannelOutboundContext,
} from "openclaw/plugin-sdk/channel-runtime";
import { sendMessageWeibo } from "./send.js";

// Simple text chunker - splits by character length
// Mode is handled by the SDK's chunkTextWithMode helper
function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }

  return chunks;
}

export const weiboOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: chunkText,
  chunkerMode: "text",
  textChunkLimit: 2000, // Weibo DM text limit is around 2000 chars

  sendText: async (ctx: ChannelOutboundContext) => {
    const { cfg, to, text, accountId } = ctx;

    const result = await sendMessageWeibo({
      cfg,
      to: to ?? "",
      text: text ?? "",
      accountId: accountId ?? undefined,
    });

    return {
      channel: "weibo" as const,
      messageId: result.messageId,
      chatId: result.chatId,
    };
  },

  sendMedia: async (_ctx: ChannelOutboundContext) => {
    // Weibo plugin doesn't support media
    throw new Error("Weibo channel does not support media messages");
  },
};
