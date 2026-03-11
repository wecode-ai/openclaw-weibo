---
name: weibo-status
description: |
  微博状态工具。当用户需要获取自己发布的微博列表、查看自己的历史微博、获取自己微博的互动数据时激活。
---

# 微博状态工具

使用 `weibo_status` 工具获取用户自己发布的微博内容。此工具使用 token 认证方式，支持分页查询。

## 基本用法

```json
{}
```

## 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `count` | number | 否 | 20 | 返回的微博数量，范围 1-100 |
| `page` | number | 否 | 1 | 页码，从 1 开始 |

## 返回结果

成功时返回：

```json
{
  "success": true,
  "total": 100,
  "previousCursor": 0,
  "nextCursor": 5000000000000001,
  "statuses": [
    {
      "id": "5000000000000000",
      "mid": "5000000000000000",
      "text": "微博内容",
      "source": "微博 weibo.com",
      "createdAt": "Wed Mar 10 10:00:00 +0800 2026",
      "repostsCount": 10,
      "commentsCount": 5,
      "attitudesCount": 20,
      "picUrls": ["http://example.com/pic.jpg"],
      "hasRetweet": false
    }
  ]
}
```

无内容时返回：

```json
{
  "success": true,
  "total": 0,
  "statuses": [],
  "message": "没有找到微博内容"
}
```

错误时返回：

```json
{
  "success": false,
  "error": "获取用户微博失败"
}
```

或

```json
{
  "error": "获取 token 失败: 响应中缺少 token"
}
```

## 使用示例

### 获取最新微博（默认参数）

```json
{}
```

### 获取指定数量的微博

```json
{ "count": 50 }
```

### 分页获取微博

```json
{ "page": 2, "count": 20 }
```

### 获取大量微博

```json
{ "count": 100, "page": 1 }
```

## 配置（必填）

```json
{
  "channels": {
    "weibo": {
      "appId": "your_app_id",
      "appSecret": "your_app_secret",
      "weiboStatusEndpoint": "http://10.54.19.204:9810/open/status/user_timeline",
      "tokenEndpoint": "http://open-im.api.weibo.com/open/auth/ws_token",
      "weiboStatusEnabled": true
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `appId` | string | 是 | - | 应用 ID，用于获取 token |
| `appSecret` | string | 是 | - | 应用密钥，用于获取 token |
| `weiboStatusEndpoint` | string | 否 | `http://open-im.api.weibo.com/open/status/user_timeline` | 用户微博 API 端点 |
| `tokenEndpoint` | string | 否 | `http://open-im.api.weibo.com/open/auth/ws_token` | Token 获取端点 |
| `weiboStatusEnabled` | boolean | 否 | `true` | 是否启用微博状态工具 |

## API 说明

此工具使用微博开放平台的用户时间线接口：

### 获取用户微博
```
GET http://open-im.api.weibo.com/open/status/user_timeline?token={token}&count={数量}&page={页码}
```

### Token 获取
```
POST http://open-im.api.weibo.com/open/auth/ws_token
Content-Type: application/json

{
  "app_id": "your_app_id",
  "app_secret": "your_app_secret"
}
```

Token 有效期为 2 小时（7200 秒），工具会自动管理 token 的缓存和刷新。

## 返回字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 微博 ID |
| `mid` | string | 微博 MID |
| `text` | string | 微博内容 |
| `source` | string | 发布来源 |
| `createdAt` | string | 发布时间 |
| `repostsCount` | number | 转发数 |
| `commentsCount` | number | 评论数 |
| `attitudesCount` | number | 点赞数 |
| `picUrls` | string[] | 图片 URL 列表 |
| `hasRetweet` | boolean | 是否为转发微博 |

## 注意事项

1. 此工具需要配置 `appId` 和 `appSecret` 才能使用
2. Token 会自动缓存，在过期前 60 秒自动刷新
3. 返回的微博按时间倒序排列（最新的在前）
4. `count` 参数最大值为 100
