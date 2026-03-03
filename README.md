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

### 快速安装（推荐）

通过与 OpenClaw AI 对话完成安装，无需手动编辑配置文件。

#### 步骤 1：获取应用凭证

1. 打开微博客户端，私信 [@微博龙虾助手](https://weibo.com/u/6808810981)
2. 发送消息：`连接龙虾`
3. 收到回复示例：
   ```
   您已经生成过应用凭证，无需重复生成。

   AppId: your-app-id
   App: your-app-secret

   如需重置凭证，请发送 "重置凭证" 命令。
   ```
4. **保存好 `AppId` 和 `App`**，下一步会用到

#### 步骤 2：让 OpenClaw 安装插件

1. 打开你的 OpenClaw 对话界面
2. 发送以下指令（直接复制粘贴）：

   ```
   安装 插件 https://github.com/wecode-ai/openclaw-weibo
   ```

3. OpenClaw 安装完成后，继续发送配置指令（将 `your-app-id` 和 `your-app-` 替换为步骤1获取的真实凭证）：

   ```
   配置如下内容
   {
     "channels": {
       "weibo": {
         "enabled": true,
         "appId": "your-app-id",
         "app": "your-app-secret"
       }
     }
   }
   ```

4. 等待 OpenClaw 回复配置成功，即可开始使用微博私信功能

> 💡 **提示**：
> - `wsEndpoint` 和 `tokenEndpoint` 需要替换为你自己的服务器地址
> - 如果想限制只有特定用户能私信 AI，将用户微博 ID 填入 `allowFrom` 数组
> - `dmPolicy: "pairing"` 表示需要用户先发消息，AI 才能回复

### 本地开发（推荐）

```bash
# 克隆仓库
git clone <your-repo-url>
cd openclaw-weibo

# 安装依赖
npm install

# 运行测试
npm run ci:check
```

### 作为 OpenClaw 插件安装

在项目目录下：

```bash
# 安装插件
openclaw plugins install .
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
      "dmPolicy": "open",
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
| `dmPolicy` | 否 | 私信策略，默认 `open` |
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
