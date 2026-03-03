# openclaw-weibo

OpenClaw Weibo DM channel plugin - 微博私信通道插件

## 功能

- WebSocket 连接管理
- Token 自动获取和缓存
- Ping/Pong 心跳保活
- 自动重连（指数退避）
- 文本消息收发
- 配对模式（Pairing）
- 多账户支持
- Allowlist 权限控制

## 安装

### 方法 1: 本地开发（推荐）

```bash
# 克隆仓库
git clone <your-repo-url>
cd openclaw-weibo

# 安装依赖
npm install

# 运行测试
npm run ci:check
```

### 方法 2: 作为 OpenClaw 插件安装

在你的 OpenClaw 项目目录下：

```bash
# 安装插件
npm install /path/to/openclaw-weibo

# 或者在 package.json 中添加
{
  "dependencies": {
    "@yourname/openclaw-weibo": "file:/path/to/openclaw-weibo"
  }
}
```

## OpenClaw 配置

编辑 `openclaw.config.json`：

```json
{
  "channels": {
    "weibo": {
      "enabled": true,
      "appId": "your-app-id",
      "appSecret": "your-app-secret",
      "wsEndpoint": "ws://your-websocket-server/ws",
      "tokenEndpoint": "http://your-token-server:9810/open/auth/ws_token",
      "dmPolicy": "pairing",
      "allowFrom": []
    }
  }
}
```

### 配置说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `enabled` | 是 | 是否启用通道 |
| `appId` | 是 | 开发者应用 ID |
| `appSecret` | 是 | 开发者应用密钥 |
| `wsEndpoint` | 是 | WebSocket 服务端点 |
| `tokenEndpoint` | 否 | Token API 端点（默认: http://localhost:9810/open/auth/ws_token） |
| `dmPolicy` | 否 | 私信策略，默认 `pairing` |
| `allowFrom` | 否 | 允许列表，用户 ID 数组 |
| `textChunkLimit` | 否 | 消息分块大小，默认 2000 字符 |
| `chunkMode` | 否 | 分块模式：`length`（按长度）/ `newline`（按换行），默认 `length` |

### 多账户配置

```json
{
  "channels": {
    "weibo": {
      "enabled": true,
      "appId": "default-app-id",
      "appSecret": "default-secret",
      "wsEndpoint": "ws://default-server/ws",
      "tokenEndpoint": "http://default-server:9810/open/auth/ws_token",
      "textChunkLimit": 2000,
      "chunkMode": "length",
      "accounts": {
        "account1": {
          "enabled": true,
          "name": "账号1",
          "appId": "app1-id",
          "appSecret": "app1-secret",
          "wsEndpoint": "ws://server1/ws",
          "tokenEndpoint": "http://server1:9810/open/auth/ws_token"
        },
        "account2": {
          "enabled": true,
          "name": "账号2",
          "appId": "app2-id",
          "appSecret": "app2-secret",
          "wsEndpoint": "ws://server2/ws",
          "tokenEndpoint": "http://server2:9810/open/auth/ws_token",
          "textChunkLimit": 1500
        }
      }
    }
  }
}
```

## 测试

### 单元测试

```bash
npm run ci:check
```

### 本地集成测试

启动测试服务器：

```bash
npx tsx test-server.js
```

在另一个终端运行测试客户端：

```bash
npx tsx test-client.ts
```

测试重连：停止服务器后再启动，观察客户端自动重连。

## 架构

```
┌─────────────┐     HTTP POST      ┌──────────────┐
│   Token API │ ◀───────────────── │  fetch token │
│ :9810       │                    │              │
└─────────────┘                    └──────────────┘
                                         │
                                         ▼
┌─────────────┐     WebSocket      ┌──────────────┐
│   WebSocket │ ◀───────────────── │   connect    │
│   Server    │                    │  (with token)│
└─────────────┘                    └──────────────┘
       │                                    │
       │ send/recv                          │ ping/pong
       ▼                                    ▼
┌─────────────┐                    ┌──────────────┐
│   Message   │                    │   Heartbeat  │
│   Handler   │                    │   (30s)      │
└─────────────┘                    └──────────────┘
                                           │
                                    ┌──────┴──────┐
                                    ▼             ▼
                              ┌─────────┐   ┌──────────┐
                              │ Reconnect│   │  Timeout │
                              │ (exp)   │   │  (10s)   │
                              └─────────┘   └──────────┘
```

## API

### 获取 Token

```http
POST http://your-token-server:9810/open/auth/ws_token
Content-Type: application/json

{
  "app_id": "your-app-id",
  "app_secret": "your-app-secret"
}
```

响应：

```json
{
  "data": {
    "token": "xxx",
    "expire_in": 7200
  }
}
```

### WebSocket 连接

```
ws://your-server/ws?app_id=xxx&token=xxx
```

### 消息格式

**接收消息：**

```json
{
  "type": "message",
  "payload": {
    "messageId": "msg_xxx",
    "fromUserId": "123456",
    "text": "Hello",
    "timestamp": 1234567890
  }
}
```

**发送消息：**

```json
{
  "type": "send_message",
  "payload": {
    "toUserId": "123456",
    "text": "Reply"
  }
}
```

**Ping：**

```json
{"type": "ping"}
```

**Pong：**

```json
{"type": "pong"}
```

## License

MIT
