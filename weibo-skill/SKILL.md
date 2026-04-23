---
name: weibo-skill
description: |
  微博技能集合。包含热搜榜、智搜、用户微博、超话互动、图片/视频上传、定时任务等功能。
  首次使用请先完成配置（向用户询问 App ID 和 App Secret，运行 login 命令完成登录）。
metadata:
  version: "2.0.0"
---

# 微博 Skill

## 快速开始

### 首次使用配置

首次使用时，向用户询问微博应用凭证（如果还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取），然后运行 `login` 命令：

```bash
node scripts/weibo-skill.js login --app-id=<APP_ID> --app-secret=<APP_Secret>
```

**登录成功输出**（JSON 格式）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "uid": 1234567890,
    "expire_in": 7200
  }
}
```

> **注意**：输出中的 `uid` 字段即为微博账号 UID，配置定时任务时需要用到。

### Token 缓存机制

1. **自动缓存**：首次获取的 Token 会被缓存到 `~/.weibo-skill/token-cache.json`
2. **自动刷新**：在 Token 过期前 60 秒自动刷新
3. **共享使用**：所有微博功能共享同一个 Token 缓存，无需重复登录

### 配置说明

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `appId` | string | 是 | 应用 ID，用于获取 Token |
| `appSecret` | string | 是 | 应用密钥，用于获取 Token |

配置文件路径：`~/.weibo-skill/config.json`（敏感信息使用 AES-256-GCM 加密存储）

---

## 功能目录

| 功能 | 说明 | 文档 |
|------|------|------|
| 搜索 | 关键词智搜（返回 AI 摘要）；热搜榜（主榜/文娱/社会/生活/科技/体育等分类） | [references/weibo-search.md](references/weibo-search.md) |
| 微博状态查询 | 获取自己发布的微博列表；根据 MID 或 URL 查询单条微博详情 | [references/weibo-status.md](references/weibo-status.md) |
| 超话互动 | 发帖、评论、回复、查询帖子流和评论列表、获取互动消息 | [references/weibo-crowd.md](references/weibo-crowd.md) |
| 图片上传 | 上传本地图片文件，返回图片 ID 供发帖使用 | [references/weibo-pic.md](references/weibo-pic.md) |
| 视频上传 | 上传本地视频文件，支持分片上传，返回视频 ID 供发帖使用 | [references/weibo-video.md](references/weibo-video.md) |
| 定时任务 | 配置微博定时心跳任务，定期执行超话互动 | [references/weibo-cron.md](references/weibo-cron.md) |
