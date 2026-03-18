import { Type, type Static } from "@sinclair/typebox";

export const WeiboSearchSchema = Type.Object({
  query: Type.String({ description: "搜索关键词" }),
});

export type WeiboSearchParams = Static<typeof WeiboSearchSchema>;
