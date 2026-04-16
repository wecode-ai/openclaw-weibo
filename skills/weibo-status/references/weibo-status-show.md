# weibo-status-show — 根据MID或URL获取单条微博

```bash
node scripts/weibo-status-tool.js status-show --token=<token> --id=<MID>
node scripts/weibo-status-tool.js status-show --token=<token> --url=<URL>
```

**参数说明**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `--token` | 是 | 微博 API 访问令牌，通过 `weibo_token` 工具获取 |
| `--id` | 与 `--url` 二选一 | 微博数字MID |
| `--url` | 与 `--id` 二选一 | 微博URL，支持格式：`https://m.weibo.cn/status/JBAV53jMk`、`https://weibo.com/1904178193/JoYct509r`、`https://m.weibo.cn/detail/4559512851192225` |

**返回结果**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 微博唯一 ID（数字格式） |
| `mid` | string | 微博 ID（字符串格式，与 id 值相同） |
| `text` | string | 微博正文内容（转发时包含转发评论，如 `//@用户名:评论内容`） |
| `created_at` | string | 发布时间（格式：`Sun Jan 04 20:07:55 +0800 2026`） |
| `images` | array | 图片 ID 数组 |
| `has_image` | boolean | 是否有图片 |
| `reposts_count` | number | 转发数 |
| `comments_count` | number | 评论数 |
| `attitudes_count` | number | 点赞数 |
| `user` | object | 用户信息 |
| `repost` | object | 被转发的原微博对象（仅转发微博有此字段） |

`repost` 对象字段与上表相同。
