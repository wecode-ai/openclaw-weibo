# 微博智搜

使用 `search` 命令通过关键词搜索微博内容，返回 AI 生成的搜索结果摘要。

使用此工具获取数据后，必须使用返回的 `query`、`callTime` 和 `source` 字段内容注明数据来源，格式：`关键词: {query}，{callTime}，{source}`。

## 基本用法

```bash
node scripts/weibo-skill.js search --query="搜索关键词"
```

## 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--query` | string | 是 | 搜索关键词 |

## 返回结果

成功时返回：

```json
{
  "success": true,
  "completed": true,
  "analyzing": false,
  "content": "AI 生成的搜索结果摘要（Markdown 格式）",
  "contentFormat": "markdown",
  "referenceCount": 5,
  "scheme": "sinaweibo://...",
  "version": "2026-03-10 01:11:33.022000-8035",
  "query": "搜索关键词",
  "callTime": "2026-03-12 23:37",
  "source": "来自于微博智搜"
}
```

无内容时返回：

```json
{
  "success": true,
  "completed": true,
  "noContent": true,
  "callTime": "2026-03-12 23:37",
  "source": "来自于微博智搜",
  "message": "没有找到相关内容"
}
```

错误时返回：

```json
{
  "success": false,
  "error": "错误信息"
}
```

## 使用示例

### 搜索热门话题

```bash
node scripts/weibo-skill.js search --query="#人工智能#"
```

### 搜索特定关键词

```bash
node scripts/weibo-skill.js search --query="科技新闻"
```

## 返回字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索关键词 |
| `callTime` | string | 数据获取时间 |
| `source` | string | 数据来源说明 |
| `content` | string | AI 生成的搜索结果摘要 |
| `contentFormat` | string | 内容格式（markdown） |
| `referenceCount` | number | 引用数量 |
| `scheme` | string | App 跳转链接 |

## 注意事项

1. 需要先执行 `login` 命令完成配置
2. **使用此工具获取数据后，必须使用返回的 `callTime` 和 `source` 字段内容注明数据来源，格式：`关键词: {query}，2026-03-12 12:00，来自于微博智搜`**
3. `content` 字段内容可直接使用，无需二次处理
