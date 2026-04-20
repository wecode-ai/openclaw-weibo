# 单条微博查询

使用 `status-show` 命令根据 MID 或 URL 获取单条微博内容。Token 由脚本自动获取，无需手动传入。

## 基本用法

```bash
# 通过 MID 查询
node scripts/weibo-skill.js status-show --id=<MID>

# 通过 URL 查询
node scripts/weibo-skill.js status-show --url=<URL>
```

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--id` | 与 `--url` 二选一 | 微博数字 MID |
| `--url` | 与 `--id` 二选一 | 微博 URL |

支持的 URL 格式：
- `https://m.weibo.cn/status/JBAV53jMk`
- `https://weibo.com/1904178193/JoYct509r`
- `https://m.weibo.cn/detail/4559512851192225`
- `http://t.cn/AXMdzqjJ`（短链）

## 返回结果

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

## 使用示例

### 通过 MID 查询

```bash
node scripts/weibo-skill.js status-show --id=4559512851192225
```

### 通过微博 URL 查询

```bash
node scripts/weibo-skill.js status-show --url="https://m.weibo.cn/status/JBAV53jMk"
```

### 通过短链查询

```bash
node scripts/weibo-skill.js status-show --url="http://t.cn/AXMdzqjJ"
```

## 注意事项

1. 需要先执行 `login` 命令完成配置
2. `--id` 和 `--url` 必须提供其中一个
3. Token 由脚本自动从配置中获取，无需手动传入
