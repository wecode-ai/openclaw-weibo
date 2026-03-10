---
name: weibo-search
description: |
  微博搜索工具。当用户需要搜索微博内容、查找微博话题、搜索微博用户发布的内容时激活。
---

# 微博搜索工具

使用 `weibo_search` 工具搜索微博内容。

## 基本用法

```json
{
  "query": "搜索关键词",
  "count": 20,
  "page": 1
}
```

## 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词 |
| `count` | integer | 否 | 返回结果数量，默认 20，最大 50 |
| `page` | integer | 否 | 页码，从 1 开始，默认 1 |

## 返回结果

```json
{
  "total_number": 1000,
  "count": 10,
  "statuses": [
    {
      "id": "微博ID",
      "mid": "微博MID",
      "text": "微博内容",
      "created_at": "发布时间",
      "source": "来源",
      "user": {
        "id": "用户ID",
        "screen_name": "用户昵称",
        "verified": true,
        "followers_count": 10000
      },
      "reposts_count": 100,
      "comments_count": 50,
      "attitudes_count": 200,
      "has_images": true,
      "is_retweet": false
    }
  ]
}
```

## 使用示例

### 搜索热门话题

```json
{ "query": "#人工智能#", "count": 10 }
```

### 搜索特定用户的微博

```json
{ "query": "from:用户名 关键词" }
```

### 分页获取更多结果

```json
{ "query": "科技新闻", "count": 50, "page": 2 }
```

## 配置

在 `openclaw.config.json` 中配置微博账号：

```json
{
  "channels": {
    "weibo": {
      "appId": "your_app_id",
      "appSecret": "your_app_secret",
      "tools": {
        "search": true
      }
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `appId` | string | 是 | - | 微博开放平台应用 ID |
| `appSecret` | string | 是 | - | 微博开放平台应用密钥 |
| `tools.search` | boolean | 否 | `true` | 是否启用搜索工具 |

### 多账号配置

```json
{
  "channels": {
    "weibo": {
      "appId": "default_app_id",
      "appSecret": "default_app_secret",
      "tools": { "search": true },
      "accounts": {
        "business": {
          "appId": "business_app_id",
          "appSecret": "business_app_secret",
          "tools": { "search": true }
        }
      }
    }
  }
}
```

## 权限要求

需要微博开放平台的 `search/status` API 权限。
