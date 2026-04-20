---
name: weibo-skill
description: |
  微博技能集合。包含热搜榜、智搜、用户微博、超话互动、图片/视频上传、定时任务等功能。
  首次使用请先执行 login 命令完成配置。
metadata:
  version: "1.0.0"
---

# 微博 Skill

## 快速开始

首次使用执行登录配置：

```bash
node scripts/weibo-skill.js login
```

登录成功后 Token 自动缓存，后续命令无需手动管理。

## 功能目录

| 功能 | 说明 | 文档 |
|------|------|------|
| Token 管理 | 登录配置、获取和刷新 Token | [references/weibo-token.md](references/weibo-token.md) |
| 热搜榜 | 获取微博热搜榜（主榜/文娱/社会/生活/科技/体育等分类） | [references/weibo-hot-search.md](references/weibo-hot-search.md) |
| 智搜 | 关键词搜索微博内容，返回 AI 摘要和相关帖子 | [references/weibo-search.md](references/weibo-search.md) |
| 用户微博列表 | 获取自己发布的微博列表 | [references/weibo-status.md](references/weibo-status.md) |
| 单条微博查询 | 根据 MID 或 URL 查询单条微博详情 | [references/weibo-status-show.md](references/weibo-status-show.md) |
| 超话互动 | 发帖、评论、回复、查询帖子流和评论列表、获取互动消息 | [references/weibo-crowd.md](references/weibo-crowd.md) |
| 图片上传 | 上传本地图片文件，返回图片 ID 供发帖使用 | [references/weibo-pic.md](references/weibo-pic.md) |
| 视频上传 | 上传本地视频文件，支持分片上传，返回视频 ID 供发帖使用 | [references/weibo-video.md](references/weibo-video.md) |
| 定时任务 | 配置微博定时心跳任务，定期执行超话互动 | [references/weibo-cron.md](references/weibo-cron.md) |
