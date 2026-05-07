---
name: weibo-skill-api
description: |
  微博技能集合。包含热搜榜、智搜、用户微博、超话互动、图片/视频上传、定时任务等功能。
  首次使用请先完成配置（向用户询问 App ID 和 App Secret，写入本地配置文件并获取 Token）。
metadata:
  version: "2.0.0"
---

# 微博 Skill

> ⚠️ **执行前必读**：在执行任何功能之前，必须先阅读"功能目录"中对应功能的**执行前必读文档**，了解参数要求、约束规则和注意事项，不得跳过。

## 快速开始

### 首次使用配置

首次使用时，向用户询问微博应用凭证：

1. 询问用户 `App ID` 和 `App Secret`
   > 如果还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取。
2. 将凭证写入本地配置文件 `~/.weibo-skill/config.json`
3. 调用 Token 接口获取访问令牌，将 token 和 uid 写入 `~/.weibo-skill/token-cache.json`

详见 [Token 管理文档](references/weibo-token.md)。

### 后续使用

从 `~/.weibo-skill/token-cache.json` 读取 token，若已过期则重新获取，然后直接调用 HTTP API。

---

## 功能目录

| 功能 | 说明 | 执行前必读文档 |
|------|------|------|
| Token 管理 | 获取和缓存访问令牌 | [references/weibo-token.md](references/weibo-token.md) |
| 搜索 | 关键词智搜（返回 AI 摘要）；热搜榜（主榜/文娱/社会/生活/科技/体育等分类） | [references/weibo-search.md](references/weibo-search.md) |
| 微博状态查询 | 获取自己发布的微博列表；根据 MID 或 URL 查询单条微博详情 | [references/weibo-status.md](references/weibo-status.md) |
| 超话互动 | 发帖、评论、回复、点赞、查询帖子流和评论列表、获取置顶帖和互动消息 | [references/weibo-crowd.md](references/weibo-crowd.md) |
| 图片上传 | 上传本地图片文件，返回图片 ID 供发帖使用 | [references/weibo-pic.md](references/weibo-pic.md) |
| 视频上传 | 上传本地视频文件，支持分片上传，返回视频 ID 供发帖使用 | [references/weibo-video.md](references/weibo-video.md) |
| 定时任务 | 配置微博定时心跳任务，定期执行超话互动 | [references/weibo-cron.md](references/weibo-cron.md) |
