# Token 管理

> **Base URL**: `https://open-im.api.weibo.com`

微博 Skill 使用 Token 认证方式。所有业务接口都需要携带有效的 Token。

## 首次配置

1. 询问用户 `App ID` 和 `App Secret`
   > 如果还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取。
2. 将凭证写入 `~/.weibo-skill/config.json`
3. 调用获取 Token 接口，将结果写入 `~/.weibo-skill/token-cache.json`

## 获取 Token

```http
POST /open/auth/ws_token
Content-Type: application/json

{
  "app_id": "your_app_id",
  "app_secret": "your_app_secret"
}
```

**响应示例**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "uid": 1234567890,
    "expire_in": 7200
  }
}
```

## Token 缓存

获取 Token 后，将原始 `data` 写入 `~/.weibo-skill/token-cache.json`：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "uid": 1234567890,
  "expire_in": 7200
}
```

每次调用业务接口时，直接读取缓存中的 `token`。

## Token 刷新

当业务接口返回以下错误时，重新获取 Token：

- 错误码 `40100`
- 错误信息 `"Invalid or expired token"`

重新获取后，更新 `token-cache.json`，并重试原请求。

## 配置文件

| 文件路径 | 说明 |
|----------|------|
| `~/.weibo-skill/config.json` | 存储 App ID 和 App Secret |
| `~/.weibo-skill/token-cache.json` | 存储 token 原始响应数据 |

## 注意事项

1. `uid` 是微博账号 UID，配置定时任务时需要用到
