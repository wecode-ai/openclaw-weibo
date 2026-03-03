import type { z } from "zod";
import type { WeiboConfigSchema, WeiboAccountConfigSchema } from "./config-schema.js";

export type WeiboConfig = z.infer<typeof WeiboConfigSchema>;
export type WeiboAccountConfig = z.infer<typeof WeiboAccountConfigSchema>;

export type ResolvedWeiboAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  appId?: string;
  appSecret?: string;
  wsEndpoint?: string;
  tokenEndpoint?: string;
  config: WeiboAccountConfig;
};

export type WeiboMessageContext = {
  messageId: string;
  senderId: string;
  text: string;
  createTime?: number;
};

export type WeiboSendResult = {
  messageId: string;
  chatId: string;
};
