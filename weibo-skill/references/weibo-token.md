# Token 管理

微博 Skill 使用统一的 Token 管理机制，所有功能共享同一个 Token 缓存，只需登录一次。

## 登录并获取 Token

```bash
node scripts/weibo-skill.js login
```

如果没有配置信息，脚本会启动交互式配置向导：

```
=== 微博 Skill 配置向导 ===

请输入您的微博应用凭证信息。
如果您还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取。

请输入 App ID: your_app_id
请输入 App Secret: your_app_secret

配置已保存到: ~/.weibo-skill/config.json
```

**登录成功输出**：

```
✓ 登录成功！
Token: eyJhbGciOiJIUzI1NiIs...
Uid: 1234567890
有效期: 7200 秒 (约 2.0 小时)
过期时间: 2026/3/19 23:47:38

--- Token 信息（JSON 格式）---
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "临时连接Token",
    "uid": 1234567890,
    "expire_in": 7200
  }
}
```

> **注意**：输出中的 `Uid:` 字段即为微博账号 UID，配置定时任务时需要用到。

## Token 缓存机制

1. **自动缓存**：首次获取的 Token 会被缓存到 `~/.weibo-skill/token-cache.json`
2. **自动刷新**：在 Token 过期前 60 秒自动刷新
3. **共享使用**：所有微博功能共享同一个 Token 缓存，无需重复登录

## 配置说明

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `appId` | string | 是 | 应用 ID，用于获取 Token |
| `appSecret` | string | 是 | 应用密钥，用于获取 Token |

## 注意事项

1. Token 有效期为 2 小时（7200 秒）
2. 需要配置 `appId` 和 `appSecret` 才能使用
3. 配置文件中的敏感信息使用 AES-256-GCM 加密存储
