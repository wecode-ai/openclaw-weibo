# Weibo WebSocket 协议草案

本文只整理当前仓库里与 Weibo 通道联调直接相关的 WebSocket 协议、鉴权结构和心跳语义，不介绍模块划分。

## 1. 连接建立流程

当前插件的连接分为两步：

1. 先通过 HTTP `tokenEndpoint` 获取临时 `token`
2. 再以 `app_id` 和 `token` 作为查询参数建立 WebSocket 连接

默认地址来自配置 schema：

- `tokenEndpoint`: `http://open-im.api.weibo.com/open/auth/ws_token`
- `wsEndpoint`: `ws://open-im.api.weibo.com/ws/stream`

连接 URL 形式如下：

```text
ws://open-im.api.weibo.com/ws/stream?app_id=<APP_ID>&token=<TOKEN>
```

本地模拟器额外允许 `/` 和 `/ws/stream` 两个路径，但插件默认使用 `/ws/stream`。

## 2. Token 获取接口

### 2.1 请求

- 方法: `POST`
- 路径: `/open/auth/ws_token`
- `Content-Type`: `application/json`

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `app_id` | `string` | 是 | 应用标识 |
| `app_secret` | `string` | 是 | 应用密钥 |

请求示例：

```json
{
  "app_id": "weibo_test_app",
  "app_secret": "weibo_test_secret_key_123456"
}
```

### 2.2 成功响应

当前插件实际消费的是 `data.token` 和 `data.expire_in`。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | `number` | 否 | 本地模拟器会返回，成功时为 `0` |
| `message` | `string` | 否 | 本地模拟器会返回 `"success"` |
| `data.token` | `string` | 是 | WebSocket 鉴权 token |
| `data.expire_in` | `number` | 是 | token 有效期，单位秒 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "tk_abc123",
    "expire_in": 3600
  }
}
```

### 2.3 失败响应

本地模拟器当前实现的错误语义如下：

| HTTP 状态码 | 业务码 | 场景 |
| --- | --- | --- |
| `400` | `4001` | 缺少 `app_id` 或 `app_secret` |
| `401` | `4002` | 凭证错误 |
| `400` | `4000` | 其他请求体错误 |

插件当前的重试策略不是看业务码，而是看 HTTP 状态码是否属于可重试集合：

- 可重试: `408` `425` `429` `500` `502` `503` `504`
- 最大重试次数: 2 次
- 总尝试次数: 3 次
- 退避: `1s -> 2s -> 最多 8s`

建议约束：

- 生产接口保持 `data.token` 和 `data.expire_in` 字段稳定
- 对于凭证错误，继续使用不可重试语义，例如 `401`

## 3. WebSocket 连接参数

连接时使用 query 参数传参：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `app_id` | `string` | 是 | 当前账号的 App ID |
| `token` | `string` | 是 | 上一步获取到的临时 token |

本地模拟器校验规则：

| 校验失败场景 | 关闭码 | 原因文本 |
| --- | --- | --- |
| 路径不是 `/` 或 `/ws/stream` | `4000` | `Invalid path` |
| 缺少 `app_id` 或 `token` | `4001` | `Missing app_id or token` |
| token 无效，或 token 与 `app_id` 不匹配 | `4002` | `Invalid token` |

插件侧只有一个显式特殊处理：

- 收到关闭码 `4002` 或关闭原因包含 `invalid token` 时，会清理本地 token 缓存
- 只有后续再次执行 `connect()` 时，才会重新取 token；默认自动重连开启时通常会发生这一步

## 4. WebSocket 下行消息

下行消息指服务端发给插件的文本消息。当前代码里插件真正消费的只有 `type = "message"`。

### 4.1 `message`

用途：把微博私信投递给插件。

结构：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"message"` | 是 | 消息类型 |
| `payload.messageId` | `string` | 是 | 消息唯一标识，插件用它做去重 |
| `payload.fromUserId` | `string` | 是 | 发送方微博用户 ID |
| `payload.text` | `string` | 否 | 旧版纯文本字段，仍兼容 |
| `payload.timestamp` | `number` | 否 | 毫秒时间戳 |
| `payload.input` | `array` | 否 | 新版 Responses-style 输入数组 |

示例：

```json
{
  "type": "message",
  "payload": {
    "messageId": "msg_in_1741080000000",
    "fromUserId": "123456789",
    "text": "你好",
    "timestamp": 1741080000000
  }
}
```

当前插件行为：

- 只处理 `type === "message"` 且存在 `payload` 的事件
- 按 `messageId` 做内存去重
- 如果 `payload.messageId` 为空字符串，会基于 `fromUserId + text + timestamp + input` 计算一个稳定回退 ID
- 文本解析优先读取 `payload.input` 里的 `role = "user"` message item
- 如果 `payload.input` 里没有文本 part，则回退到 `payload.text`
- 如果最终既没有文本也没有可持久化附件，则直接丢弃
- 纯图片 / 纯文件消息是允许的；这类消息会以空文本 + 媒体上下文的方式继续传给 Claw

推荐的新请求形态如下：

```json
{
  "type": "message",
  "payload": {
    "messageId": "msg_in_1741080000000",
    "fromUserId": "123456789",
    "text": "帮我看看这两份附件",
    "timestamp": 1741080000000,
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "帮我看看这两份附件"
          },
          {
            "type": "input_image",
            "filename": "image.png",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": "<base64>"
            }
          },
          {
            "type": "input_file",
            "filename": "doc.txt",
            "source": {
              "type": "base64",
              "media_type": "text/plain",
              "data": "<base64>"
            }
          }
        ]
      }
    ]
  }
}
```

兼容性建议：

- 新接入方应优先构造 `payload.input`
- `payload.text` 建议保留为纯文本镜像，便于旧逻辑回退和日志预览
- 如果只发 `payload.text`，当前插件仍兼容

### 4.1.1 `payload.input` 的设计语言

插件当前只在 `message` 的 `payload.input` 中实现了 Responses-style 输入语言的一个子集。

当前支持的输入 item：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `item.type` | `"message"` | 当前只处理 message item |
| `item.role` | `"user"` | 当前只消费 user role |
| `item.content[]` | `array` | 内容 part 列表 |

当前支持的内容 part：

| `content[].type` | 当前行为 |
| --- | --- |
| `input_text` | 作为正文文本输入 |
| `input_image` | 作为图片附件输入 |
| `input_file` | 作为文件附件输入 |

当前接受但不生效的输入语言：

| 类型 | 当前行为 |
| --- | --- |
| `message` with role `system` / `developer` / `assistant` | 忽略 |
| 未知 content part | 忽略 |

### 4.1.2 `input_text`

结构：

```json
{
  "type": "input_text",
  "text": "帮我看看这张图"
}
```

当前插件行为：

- 只要 part 出现在 `role = "user"` 的 message item 中，就会参与正文拼接
- 多个 `input_text` part 之间会用换行符拼接

### 4.1.3 `input_image`

结构：

```json
{
  "type": "input_image",
  "filename": "image.png",
  "source": {
    "type": "base64",
    "media_type": "image/png",
    "data": "<base64>"
  }
}
```

当前插件行为：

- 当前只支持 `source.type = "base64"`
- 解码后通过 OpenClaw 的 `saveMediaBuffer(...)` 落为 inbound 媒体文件
- 再通过 `buildAgentMediaPayload(...)` 写入 `MediaPath`、`MediaPaths`、`MediaType`、`MediaTypes`、`MediaUrl`、`MediaUrls`
- 仅允许这些图片 MIME：`image/jpeg`、`image/png`、`image/gif`、`image/webp`
- 图片大小上限由当前插件常量控制，为 `10MB`

### 4.1.4 `input_file`

结构：

```json
{
  "type": "input_file",
  "filename": "doc.txt",
  "source": {
    "type": "base64",
    "media_type": "text/plain",
    "data": "<base64>"
  }
}
```

当前插件行为：

- 当前只支持 `source.type = "base64"`
- 解码后同样通过 `saveMediaBuffer(...)` 落为 inbound 文件
- 再通过 `buildAgentMediaPayload(...)` 暴露给 Claw
- 文件大小上限由当前插件常量控制，为 `5MB`

### 4.2 `system`

用途：本地模拟器在连接建立后发送的系统提示。插件当前不会消费它。

结构：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"system"` | 是 | 系统消息 |
| `payload.message` | `string` | 是 | 提示文案 |
| `payload.serverTime` | `string` | 是 | ISO 时间 |
| `payload.pongTimeoutMs` | `number` | 是 | 模拟器服务端超时阈值 |

示例：

```json
{
  "type": "system",
  "payload": {
    "message": "connected to weibo sim server",
    "serverTime": "2026-03-04T10:00:00.000Z",
    "pongTimeoutMs": 120000
  }
}
```

### 4.3 `ping`

用途：服务端应用层心跳。

结构：

```json
{
  "type": "ping"
}
```

当前插件行为：

- 会把它当成普通 JSON 事件透传给上层消息处理器
- 监控层只处理 `message`，因此 `ping` 实际不会触发业务逻辑
- 插件不会自动回复 JSON `pong`

注意：

- 当前插件只会识别来自服务端的 `pong`，不会对收到的 JSON `ping` 主动 `send({ type: "pong" })`
- 本地模拟器之所以能维持连接，是因为它在收到客户端发出的 JSON `{"type":"ping"}` 后，会回一个 JSON `{"type":"pong"}`

建议约束：

- 如果生产服务端需要应用层心跳，最好不要依赖客户端自动响应 JSON `ping`
- 更稳妥的做法是继续依赖底层 WebSocket `ping/pong` 帧，或明确约定客户端必须实现 JSON `pong`

### 4.4 `ack`

用途：本地模拟器对 `send_message` 的接收确认。插件当前不会消费它。

结构：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"ack"` | 是 | 确认消息 |
| `payload.messageId` | `string` | 是 | 模拟器生成的消息记录 ID |
| `payload.receivedAt` | `number` | 是 | 接收时间戳，毫秒 |

示例：

```json
{
  "type": "ack",
  "payload": {
    "messageId": "sim_msg_001",
    "receivedAt": 1741080001234
  }
}
```

重要说明：

- `ack.payload.messageId` 不是插件发出的 `payload.messageId`
- 它是模拟器内部的消息记录 ID
- 如果以后要做端到端回执，建议新增 `clientMessageId` 字段，避免语义混淆

### 4.5 `error`

用途：本地模拟器返回协议错误。插件当前不会消费它。

示例：

```json
{
  "type": "error",
  "payload": {
    "message": "toUserId is required"
  }
}
```

## 5. WebSocket 上行消息

上行消息指插件发给服务端的文本消息。

### 5.1 `send_message`

这是当前插件唯一明确发送的业务消息类型。

结构：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"send_message"` | 是 | 发送私信 |
| `payload.toUserId` | `string` | 是 | 目标用户 ID |
| `payload.text` | `string` | 是 | 消息文本 |
| `payload.messageId` | `string` | 是 | 客户端生成的消息 ID |
| `payload.chunkId` | `number` | 是 | 分片序号，从 `0` 开始 |

示例：

```json
{
  "type": "send_message",
  "payload": {
    "toUserId": "123456789",
    "text": "这是一条回复",
    "messageId": "msg_1741080000000_abcd",
    "chunkId": 0
  }
}
```

当前实现语义：

- `toUserId` 来自 OpenClaw 的 `to`，最终会被归一化为裸用户 ID
- `messageId` 由插件生成，格式近似 `msg_<timestamp>_<random>`
- `chunkId` 是分片号，长文本回复会复用同一个 `messageId`，仅递增 `chunkId`

本地模拟器当前只严格使用两个字段：

- `payload.toUserId`
- `payload.text`

模拟器会原样记录 `messageId` 和 `chunkId` 到日志与原始 payload 中，但不会基于它们做回执映射。

建议约束：

- 服务端应把 `messageId + chunkId` 视为一条发送片段的逻辑键
- 如果服务端有回执需求，回执里应该带回 `clientMessageId` 和 `chunkId`

### 5.2 `ping`

插件每 30 秒发送一次应用层心跳：

```json
{
  "type": "ping"
}
```

发送条件：

- WebSocket 处于 `OPEN`
- 最近一次 pong 未超时

超时判断：

- 心跳周期: `30000ms`
- 客户端 pong 超时窗口: `10000ms`
- 超过 `30000 + 10000 = 40000ms` 未收到 pong 时，客户端会主动 `terminate()` 连接并进入重连

### 5.3 `pong`

客户端代码支持发送如下应用层响应：

```json
{
  "type": "pong"
}
```

但当前插件正常运行路径不会自动发送该消息；它只在收到文本 `pong`、JSON `{"type":"pong"}` 或底层 WebSocket `pong` 帧时更新心跳时间。

## 6. 底层帧与应用层消息的关系

当前实现同时存在两套心跳机制：

1. 底层 WebSocket 控制帧
2. 应用层 JSON 消息

插件客户端会处理以下 pong 形式：

| 形式 | 是否识别 | 说明 |
| --- | --- | --- |
| WebSocket `pong` 控制帧 | 是 | 通过 `ws.on("pong")` 处理 |
| 文本 `"pong"` | 是 | 特判字符串 |
| JSON `{"type":"pong"}` | 是 | 特判 JSON |

本地模拟器会发送以下心跳：

| 形式 | 方向 | 说明 |
| --- | --- | --- |
| WebSocket `ping` 控制帧 | 服务端 -> 客户端 | 主心跳 |
| JSON `{"type":"ping"}` | 服务端 -> 客户端 | 额外应用层心跳 |

本地模拟器会接受以下 pong：

| 形式 | 是否更新 `lastPongAt` |
| --- | --- |
| WebSocket `pong` 控制帧 | 是 |
| 文本 `"pong"` | 是 |
| JSON `{"type":"pong"}` | 是 |

因此，当前联调最稳的约定是：

- 服务端需要对客户端每 30 秒发出的 JSON `{"type":"ping"}` 返回可被客户端识别的 pong
- 可被客户端识别的 pong 目前有三种：WebSocket `pong` 控制帧、文本 `"pong"`、JSON `{"type":"pong"}`
- 仅有服务端主动发起的 WebSocket `ping` 控制帧，并不足以更新客户端的 `lastPongTime`

## 7. 关闭与重连语义

### 7.1 本地模拟器关闭码

| 关闭码 | 原因 | 含义 |
| --- | --- | --- |
| `4000` | `Invalid path` | 路径不合法 |
| `4001` | `Missing app_id or token` | 缺少鉴权参数 |
| `4002` | `Invalid token` | token 无效或与 appId 不匹配 |
| `4005` | `Pong timeout` | 服务端长时间未收到 pong |
| `1011` | `Heartbeat error` | 服务端发送心跳失败 |
| `1001` | `Server shutting down` | 服务端主动下线 |

### 7.2 插件重连策略

插件默认启用自动重连，参数如下：

| 项目 | 值 |
| --- | --- |
| 初始退避 | `1000ms` |
| 最大退避 | `60000ms` |
| 最大重连次数 | `0`，表示无限重试 |
| 退避公式 | 指数退避，`1s -> 2s -> 4s ... -> 60s` |

会触发退避重连的典型场景：

- 连接关闭，且 `shouldReconnect = true`
- 获取 token 失败，且属于可重试状态码

不会进入退避的典型场景：

- 账号未配置
- token 获取失败且被判定为不可重试，例如 `401`
- 外部显式调用 `close()`

## 8. 插件实际消费的最小协议面

如果只关心“服务端最少要实现什么，插件才能工作”，答案如下。

### 8.1 必须支持

1. `POST /open/auth/ws_token`
2. `ws://.../ws/stream?app_id=...&token=...`
3. 下行 `message`，其中推荐使用 `payload.input`
4. 服务端需要响应客户端的应用层 `ping`，使客户端能收到可识别的 pong
5. 接收上行 `send_message`

### 8.2 建议支持

1. token 失效时关闭码使用 `4002`
2. 回执消息显式回传 `clientMessageId` 与 `chunkId`
3. 不要让应用层 JSON `ping/pong` 成为唯一心跳机制

## 9. 本地模拟器联调接口

为了对照协议抓联调数据，本仓库自带一个模拟器。

### 9.1 启动

```bash
npm run sim:server
```

默认端口：

- HTTP: `9810`
- WebSocket: `9999`

### 9.2 常用接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/credentials` | 生成一组新的 `app_id/app_secret` |
| `POST` | `/open/auth/ws_token` | 换取 token |
| `POST` | `/api/messages/send` | 模拟服务端向插件投递一条 `message` |
| `GET` | `/api/messages` | 查看模拟器记录的消息 |
| `GET` | `/api/messages/receive` | 查看插件发给模拟器的上行消息 |
| `GET` | `/api/ws/frames` | 同上，兼容别名 |
| `GET` | `/api/state` | 查看连接、token、计数状态 |

### 9.3 `POST /api/messages/send` 请求体

本地模拟器会把这个 HTTP 请求转换成一条下行 WebSocket `message` 事件发给已连接插件。

请求体字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `app_id` | `string` | 是 | 目标应用 ID |
| `from_user_id` | `string` | 否 | 模拟发送方用户 ID；默认 `123456789` |
| `text` | `string` | 否 | 兼容旧版纯文本字段 |
| `input` | `array` | 否 | 新版 Responses-style 输入 |

约束：

- `app_id` 必填
- `text` 和 `input` 至少要有一个
- 只传附件时，`text` 可以为空字符串

示例：

```json
{
  "app_id": "weibo_test_app",
  "from_user_id": "123456789",
  "text": "请看附件",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "请看附件"
        },
        {
          "type": "input_image",
          "filename": "image.png",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "<base64>"
          }
        }
      ]
    }
  ]
}
```

### 9.4 关键实现位置

如果要追代码，优先看这些文件：

- `src/token.ts`: token 请求与重试规则
- `src/client.ts`: WebSocket 连接、心跳、重连
- `src/send.ts`: `send_message` 上行结构
- `src/bot.ts`: `message` 下行结构消费方式
- `weibo-server.ts`: 本地模拟器的协议实现
