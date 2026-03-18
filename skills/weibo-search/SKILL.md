---
name: weibo-search
description: |
  微博智搜工具，通过关键词获取微博智搜内容。当用户需要搜索微博内容、查找微博话题、搜索微博用户发布的内容时激活。
  搜索内容`content`直接返回。
  使用此工具获取数据后，必须使用返回的`query`,`callTime` 和 `source` 字段内容注明数据来源, 格式: 关键词: {query}， 2026-03-12 12:00，来自于微博智搜。
---

# 微博智搜工具

使用 `weibo_search` 工具搜索微博内容。此工具不需要认证，使用 SID 方式访问微博搜索 API，返回 AI 生成的搜索结果摘要。

## 基本用法

```json
{
  "query": "搜索关键词"
}
```

## 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词 |

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
  "callTime": "2026-03-12 23:37",
  "source": "来自于微博热搜"
}
```

无内容时返回：

```json
{
  "success": true,
  "completed": true,
  "noContent": true,
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

```json
{ "query": "#人工智能#" }
```

### 搜索新闻事件

```json
{ "query": "伊朗" }
```

### 搜索特定关键词

```json
{ "query": "科技新闻" }
```

### 配置项说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `weiboSearchEndpoint` | string | 否 | `http://open-im.api.weibo.com/open/wis/search_query` | 搜索 API 端点 |
| `weiboSearchEnabled` | boolean | 否 | `true` | 是否启用搜索工具 |

## API 说明

此工具使用微博开放平台的搜索接口：

```
GET http://open-im.api.weibo.com/open/wis/search_query?query={关键词}
```

## 返回字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `callTime` | string | 数据获取时间 |
| `source` | string | 数据来源说明 |
| `content` | string | AI 生成的搜索结果摘要 |
| `contentFormat` | string | 内容格式（markdown） |
| `referenceCount` | number | 引用数量 |
| `scheme` | string | App 跳转链接 |

## 注意事项

1. **使用此工具获取数据后，必须使用返回的 `callTime` 和 `source` 字段内容注明数据来源**
2. **格式: 2026-03-12 12:00，来自于微博智搜**

