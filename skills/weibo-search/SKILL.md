---
name: weibo-search
description: |
  微博搜索工具。当用户需要搜索微博内容、查找微博话题、搜索微博用户发布的内容时激活。
---

# 微博搜索工具

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
  "version": "2026-03-10 01:11:33.022000-8035"
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

## 配置（可选）



```json
{
  "channels": {
    "weibo": {
      "weiboSearchEndpoint": "http://open-im.api.weibo.com/open/wis/search_query",
      "weiboSearchEnabled": true
    }
  }
}
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


