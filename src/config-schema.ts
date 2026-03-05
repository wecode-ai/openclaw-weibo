import { z } from "zod";
export { z };

const DmPolicySchema = z.enum(["open", "pairing"]).default("open");

// Chunk mode:
// - length: split by character limit
// - newline: split at paragraph boundaries (blank lines)
// - raw: forward upstream chunks as-is (no secondary chunking)
const ChunkModeSchema = z.enum(["length", "newline", "raw"]).default("raw");

const WeiboSharedConfigShape = {
  dmPolicy: DmPolicySchema.optional(),
  allowFrom: z.array(z.string()).optional(),
  textChunkLimit: z.number().int().positive().optional(),
  chunkMode: ChunkModeSchema,
  // Whether to allow OpenClaw block streaming for this channel/account.
  // true: stream block replies progressively; false: final-only delivery.
  blockStreaming: z.boolean().default(true),
};

export const WeiboAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    wsEndpoint: z.string().url().default("ws://open-im.api.weibo.com/ws/stream"),
    tokenEndpoint: z.string().url().default("http://open-im.api.weibo.com/open/auth/ws_token"),
    ...WeiboSharedConfigShape,
  })
  .strict();

export const WeiboConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    wsEndpoint: z.string().url().default("ws://open-im.api.weibo.com/ws/stream"),
    tokenEndpoint: z.string().url().default("http://open-im.api.weibo.com/open/auth/ws_token"),
    ...WeiboSharedConfigShape,
    accounts: z.record(z.string(), WeiboAccountConfigSchema.optional()).optional(),
  })
  .strict();
