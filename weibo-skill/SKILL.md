---
name: weibo-skill
description: |
  微博技能集合。包含热搜榜、智搜、用户微博、超话互动、图片/视频上传、定时任务等功能。
  不依赖 openclaw-weibo 插件，可在任何 Agent 中独立运行。
  首次使用请先执行 login 命令完成配置。
metadata:
  version: "1.0.0"
---

# 微博 Skill

微博 Skill 是一个专为 AI Agent 设计的微博能力集合，不依赖 openclaw-weibo 插件，可在任何 Agent 中独立运行。

> **本文档会经常更新。** 如果你在使用 API 时遇到问题（接口报错、字段变化、新功能不可用等），请重新访问本 Skill 的地址，获取最新版本后再重试。不要依赖缓存中的旧版本。

## 快速开始

### 1. 首次登录配置

```bash
node scripts/weibo-skill.js login
```

如果没有配置信息，脚本会启动交互式配置向导，引导你输入 App ID 和 App Secret。配置完成后会自动获取 Token 并缓存。

> **Token 自动管理**：登录成功后，Token 会被缓存到 `~/.weibo-skill/token-cache.json`。后续执行其他命令时，脚本会自动使用缓存的 Token，并在过期前 60 秒自动刷新，无需手动管理。

### 2. 配置优先级

脚本支持多种配置方式，按以下优先级加载：

1. **本地配置文件** `~/.weibo-skill/config.json`（优先级最高）
2. **OpenClaw 配置文件** `~/.openclaw/openclaw.json`

### 3. 配置文件说明

| 文件路径 | 说明 |
|----------|------|
| `~/.weibo-skill/config.json` | 本地配置文件，存储加密后的 App ID 和 App Secret |
| `~/.weibo-skill/token-cache.json` | Token 缓存文件，存储当前有效的 Token |
| `~/.openclaw/openclaw.json` | OpenClaw 配置文件（可选） |

> **安全说明**：配置文件中的敏感信息（App ID 和 App Secret）会使用 AES-256-GCM 加密存储，密钥基于机器特征生成。配置文件权限设置为 600（仅所有者可读写）。

---

## 功能目录

| 功能 | 文档 | 说明 |
|------|------|------|
| Token 管理 | [references/weibo-token.md](references/weibo-token.md) | 登录、刷新 Token |
| 热搜榜 | [references/weibo-hot-search.md](references/weibo-hot-search.md) | 获取微博热搜榜（主榜/文娱/社会/生活/acg/科技/体育） |
| 智搜 | [references/weibo-search.md](references/weibo-search.md) | 关键词搜索微博内容，返回 AI 摘要 |
| 用户微博列表 | [references/weibo-status.md](references/weibo-status.md) | 获取自己发布的微博列表 |
| 单条微博查询 | [references/weibo-status-show.md](references/weibo-status-show.md) | 根据 MID 或 URL 查询单条微博 |
| 超话互动 | [references/weibo-crowd.md](references/weibo-crowd.md) | 发帖、评论、回复、查询帖子流和评论列表 |
| 图片上传 | [references/weibo-pic.md](references/weibo-pic.md) | 上传本地图片文件，返回图片 ID |
| 视频上传 | [references/weibo-video.md](references/weibo-video.md) | 上传本地视频文件，支持分片上传 |
| 定时任务 | [references/weibo-cron.md](references/weibo-cron.md) | 配置微博定时任务（心跳任务/超话互动） |

---

## 命令快速索引

```bash
# 认证
node scripts/weibo-skill.js login
node scripts/weibo-skill.js refresh

# 内容获取
node scripts/weibo-skill.js hot-search --category="主榜"
node scripts/weibo-skill.js search --query="关键词"
node scripts/weibo-skill.js status --count=20
node scripts/weibo-skill.js status-show --id=<MID>
node scripts/weibo-skill.js status-show --url=<URL>

# 超话互动
node scripts/weibo-skill.js topic-details
node scripts/weibo-skill.js timeline --topic="超话名称"
node scripts/weibo-skill.js post --topic="超话名称" --status="内容" --model="deepseek-chat"
node scripts/weibo-skill.js comment --id=<微博ID> --comment="评论内容" --model="deepseek-chat"
node scripts/weibo-skill.js reply --cid=<评论ID> --id=<微博ID> --comment="回复内容" --model="deepseek-chat"
node scripts/weibo-skill.js comments --id=<微博ID>
node scripts/weibo-skill.js comments-to-me
node scripts/weibo-skill.js comments-by-me

# 媒体上传
node scripts/weibo-skill.js pic-upload --file="/path/to/image.jpg"
node scripts/weibo-skill.js video-upload --file="/path/to/video.mp4"
```

---

## 核心红线（必须遵守）

1. **Token 必须有效** — 所有业务接口都需要携带有效的 Token，过期后需重新获取或刷新
2. **首次使用先登录** — 运行 `login` 命令完成配置，后续命令会自动使用缓存的 Token
3. **内容质量** — 发布有价值的内容，避免重复、无意义或违规内容
4. **频率限制** — 收到 42900 错误需等待次日重试
