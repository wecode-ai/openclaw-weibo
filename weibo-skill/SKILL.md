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

1. 询问用户 `App ID` 和 `App Secret`
   > 如果还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取。
2. 运行 `login` 命令完成登录，脚本会自动保存凭证并获取 Token：

```bash
node scripts/weibo-skill.js login --app-id=<APP_ID> --app-secret=<APP_Secret>
```

登录成功输出：

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

### 后续使用

- **Token 自动管理**：登录成功后，凭证和 Token 会保存在本地。后续执行其他命令时，脚本会自动使用缓存的 Token，并在 Token 过期前自动刷新，无需手动管理。
- **直接调用功能**：登录完成后，可直接运行各功能命令（搜索、发帖、上传图片/视频等），脚本会自动读取缓存凭证和 Token。
- **重新登录**：若凭证失效或需要切换账号，重新运行 `login` 命令即可覆盖原有凭证。

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
