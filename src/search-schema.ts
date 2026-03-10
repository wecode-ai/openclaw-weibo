import { Type, type Static } from "@sinclair/typebox";

export const WeiboSearchSchema = Type.Object({
  query: Type.String({ description: "搜索关键词" }),
  count: Type.Optional(
    Type.Integer({
      description: "返回结果数量，默认 20，最大 50",
      minimum: 1,
      maximum: 50,
    })
  ),
  page: Type.Optional(
    Type.Integer({
      description: "页码，从 1 开始，默认 1",
      minimum: 1,
    })
  ),
});

export type WeiboSearchParams = Static<typeof WeiboSearchSchema>;
