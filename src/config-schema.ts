import { z } from "zod";
export { z };

const DmPolicySchema = z.enum(["open", "pairing"]).default("open");

// Chunk mode: "length" = split by character limit, "newline" = split at newlines
const ChunkModeSchema = z.enum(["length", "newline"]).default("newline");

const WeiboSharedConfigShape = {
  dmPolicy: DmPolicySchema.optional(),
  allowFrom: z.array(z.string()).optional(),
  textChunkLimit: z.number().int().positive().optional(),
  chunkMode: ChunkModeSchema,
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
