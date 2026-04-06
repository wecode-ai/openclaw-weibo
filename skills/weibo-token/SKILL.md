---
name: weibo-token
description: |
  微博 API 访问令牌工具。用于获取和管理微博 API 的访问 token。
  此工具为其他微博工具（热搜、搜索、用户微博等）提供统一的 token 管理服务。
  token 有效期为 2 小时，工具会自动缓存和刷新。
metadata:
  version: "1.0.0"
---

# 微博 Token 工具

使用 `weibo_token` 工具获取微博 API 访问令牌。此工具提供统一的 token 管理服务，为其他微博工具提供认证支持。

## 基本用法

```json
{
  "tool_calls": [
    {
      "name": "weibo_token",
      "arguments": {}
    }
  ]
}
```

此工具不需要任何参数，直接调用即可获取当前有效的 token。

## 参数说明

此工具无需参数。

## 返回结果

成功时返回：

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "acquiredAt": "2026-03-12T15:30:00.000Z",
  "expiresIn": 7200,
  "expiresAt": "2026-03-12T17:30:00.000Z"
}
```

错误时返回：

```json
{
  "success": false,
  "error": "获取微博 token 失败: 错误信息"
}
```

## 返回字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功获取 token |
| `token` | string | 访问令牌 |
| `acquiredAt` | string | token 获取时间（ISO 8601 格式） |
| `expiresIn` | number | token 有效期（秒），默认 7200 秒（2小时） |
| `expiresAt` | string | token 过期时间（ISO 8601 格式） |

## 配置（必填）

```json
{
  "channels": {
    "weibo": {
      "appId": "your_app_id",
      "appSecret": "your_app_secret"
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `appId` | string | 是 | - | 应用 ID，用于获取 token |
| `appSecret` | string | 是 | - | 应用密钥，用于获取 token |
| `tokenEndpoint` | string | 否 | `http://open-im.api.weibo.com/open/auth/ws_token` | Token 获取端点 |
| `weiboTokenEnabled` | boolean | 否 | `true` | 是否启用 token 工具 |

## API 说明

此工具使用微博开放平台的 token 接口：

### 获取 Token
```
POST http://open-im.api.weibo.com/open/auth/ws_token
Content-Type: application/json

{
  "app_id": "your_app_id",
  "app_secret": "your_app_secret"
}
```

### 响应示例
```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expire_in": 7200
  }
}
```

## Token 缓存机制

1. **自动缓存**：首次获取的 token 会被缓存
2. **自动刷新**：在 token 过期前 60 秒自动刷新
3. **共享使用**：所有微博工具共享同一个 token 缓存

## 使用场景

此工具主要用于以下场景：

1. **调试**：检查当前 token 状态和有效期
2. **预热**：在使用其他微博工具前预先获取 token
3. **监控**：监控 token 的获取和刷新情况

## 与其他工具的关系

以下微博工具依赖此 token 工具进行认证：

- `weibo_hot_search` - 微博热搜榜
- `weibo_search` - 微博智搜
- `weibo_status` - 用户微博

这些工具会自动调用 token 管理功能，无需手动获取 token。

## 注意事项

1. 此工具需要配置 `appId` 和 `appSecret` 才能使用
2. Token 有效期为 2 小时（7200 秒）
3. 工具会在 token 过期前 60 秒自动刷新
4. 所有微博工具共享同一个 token 缓存，避免重复获取
