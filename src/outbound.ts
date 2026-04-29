import path from "node:path";
import type {
  ChannelOutboundAdapter,
  ChannelOutboundContext,
} from "openclaw/plugin-sdk/channel-runtime";
import { sendMessageWeibo, sendFileDmWeibo } from "./send.js";
import { getWeiboRuntime } from "./runtime.js";

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

  sendMedia: async (ctx: ChannelOutboundContext) => {
    const { cfg, to, text, mediaUrl, accountId, mediaLocalRoots } = ctx;

    // Send text first if provided
    if (text?.trim()) {
      await sendMessageWeibo({
        cfg,
        to: to ?? "",
        text,
        accountId: accountId ?? undefined,
      });
    }

    // Upload and send media file if URL or local path provided
    if (mediaUrl) {
      try {
        const loaded = await getWeiboRuntime().media.loadWebMedia(mediaUrl, {
          optimizeImages: false,
          localRoots: mediaLocalRoots?.length ? mediaLocalRoots : undefined,
        });

        const buffer = loaded.buffer;
        // Derive filename: prefer loaded.fileName, fallback to URL basename
        const urlBaseName = path.basename(mediaUrl.split("?")[0] ?? "");
        const fileName = loaded.fileName ?? (urlBaseName || "file");

        const result = await sendFileDmWeibo({
          cfg,
          to: to ?? "",
          buffer,
          fileName,
          accountId: accountId ?? undefined,
        });

        return {
          channel: "weibo" as const,
          messageId: result.messageId,
          chatId: result.chatId,
        };
      } catch (err) {
        // Log the error for debugging
        console.error(`[weibo] sendFileDmWeibo failed:`, err);
        // Fallback to URL link only if mediaUrl is an actual URL (not a local path)
        const isUrl = /^https?:\/\//i.test(mediaUrl);
        if (isUrl) {
          const fallbackText = `📎 ${mediaUrl}`;
          const result = await sendMessageWeibo({
            cfg,
            to: to ?? "",
            text: fallbackText,
            accountId: accountId ?? undefined,
          });
          return {
            channel: "weibo" as const,
            messageId: result.messageId,
            chatId: result.chatId,
          };
        }

        // Local path but not a path-not-allowed error — re-throw
        throw err;
      }
    }

    // No media URL, just return text result
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
};
