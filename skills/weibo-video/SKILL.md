---
name: weibo-video
description: |
  微博视频上传工具。当用户需要上传本地视频文件到微博时激活。
  支持大文件分片上传，自动计算 MD5 校验值，显示上传进度。
---

# 微博视频上传 Skill

微博视频上传是一个专为 AI Agent 设计的视频上传能力。在这里，Agent 可以将本地视频文件上传到微博平台。

> **本文档会经常更新。** 如果你在使用 API 时遇到问题（接口报错、字段变化、新功能不可用等），请重新访问本 Skill 的地址，获取最新版本后再重试。不要依赖缓存中的旧版本。

## 脚本调用方式

本 Skill 使用脚本 `scripts/weibo-video.js` 完成所有接口调用。

### 配置优先级

脚本支持多种配置方式，按以下优先级加载：

1. **本地配置文件** `~/.weibo-video/config.json`（优先级最高）
2. **OpenClaw 配置文件** `~/.openclaw/openclaw.json`

### 可用命令

| 命令 | 说明 |
|------|------|
| `login` | 登录并获取 Token（首次使用请先执行此命令） |
| `refresh` | 刷新 Token |
| `upload` | 上传本地视频文件 |
| `help` | 显示帮助信息 |

---

## 平台结构

微博视频上传 Skill 提供以下核心能力：

- **视频上传** — 将本地视频文件上传到微博平台
- **分片上传** — 自动将大文件分片上传，支持大文件
- **进度显示** — 实时显示上传进度
- **MD5 校验** — 自动计算文件和分片的 MD5 校验值，确保数据完整性

---

## 快速开始

### 1. 登录并获取 Token

首次使用时，运行 `login` 命令进行登录配置：

```bash
node scripts/weibo-video.js login
```

如果没有配置信息，脚本会启动交互式配置向导，引导你输入 App ID 和 App Secret。配置完成后会自动获取 Token 并缓存。

**交互式配置流程**：
```
=== 微博视频上传配置向导 ===

请输入您的微博应用凭证信息。
如果您还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取。

请输入 App ID: your_app_id
请输入 App Secret: your_app_secret

配置已保存到: ~/.weibo-video/config.json
```

**登录成功输出**：
```
✓ 登录成功！
Token: eyJhbGciOiJIUzI1NiIs...
有效期: 7200 秒 (约 2.0 小时)
过期时间: 2026/3/19 23:47:38

--- Token 信息（JSON 格式）---
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "临时连接Token",
    "expire_in": 7200
  }
}
```

> **Token 自动管理**：登录成功后，Token 会被缓存到 `~/.weibo-video/token-cache.json`。后续执行其他命令时，脚本会自动使用缓存的 Token，并在过期前 60 秒自动刷新，无需手动管理。

### 2. 上传视频

登录后，使用 `upload` 命令上传视频：

```bash
node scripts/weibo-video.js upload --file="/path/to/video.mp4"
```

**参数说明**：

| 参数 | 说明 | 必填 |
|------|------|------|
| `--file` | 视频文件路径 | 是 |
| `--type` | 文件类型，默认 video | 否 |
| `--video-type` | 视频类型，默认 normal | 否 |
| `--upload-only` | 是否仅上传，默认 false | 否 |
| `--custom-name` | 是否支持自定义名称，默认 false | 否 |

**上传过程输出**：
```
[INFO] 准备上传视频: video.mp4
[INFO] 文件大小: 25.50 MB
[INFO] 计算文件校验值...
[INFO] 初始化上传...
[INFO] 分片数量: 6
[████████████████████░] 85% 上传分片 5/6
[SUCCESS] ✓ 视频上传完成！
```

**返回示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "mediaId": "xxx",
    "fmid": "xxx",
    "url": "https://video.weibo.com/xxx"
  }
}
```

### 3. 刷新 Token

```bash
node scripts/weibo-video.js refresh
```

返回示例：
```json
{
  "code": 0,
  "message": "success"
}
```

---

## 核心红线（必须遵守）

1. **Token 必须有效** — 所有业务接口都需要携带有效的 Token，过期后需重新获取或刷新
2. **文件必须存在** — 上传前会检查文件是否存在，不存在会报错
3. **文件大小限制** — 请注意微博平台对视频文件大小的限制
4. **网络稳定性** — 大文件上传需要稳定的网络连接，建议在网络良好时上传
5. **频率限制** — 收到 42900 错误需等待次日

---

## 使用流程（推荐）

```
1. 首次使用登录 → node weibo-video.js login（配置凭证并获取 Token）
2. 准备视频文件 → 确保视频文件路径正确
3. 上传视频 → node weibo-video.js upload --file="/path/to/video.mp4"
4. 获取上传结果 → 记录返回的 mediaId、fmid 和 url
5. Token 会自动管理，无需手动刷新
```

> **注意**：登录后 Token 会自动缓存和刷新，无需每次手动获取。

---

## 技术细节

### 分片上传机制

视频上传采用分片上传机制，将大文件分割成多个小块依次上传：

1. **分片大小**：由服务端 init 接口返回（单位 KB），默认约 10MB
2. **MD5 校验**：每个分片都会计算 MD5 校验值，确保数据完整性
3. **断点续传**：服务端支持断点续传（需要保存 fileToken）

### 上传流程

```
1. 计算文件 MD5 校验值
2. 调用 init 接口初始化上传，获取 fileToken 和分片大小（length，单位 KB）
3. 根据服务端返回的分片大小将文件分割成多个分片
4. 依次上传每个分片，每个分片需要计算 sectioncheck（分片 MD5）
5. 最后一个分片上传完成后，返回最终结果（包含 fmid 和 url）
```

### API 接口说明

#### 初始化视频上传

```
GET /open/video/init?token=xxx&type=video&video_type=normal&check=xxx&name=xxx&length=xxx
```

**参数**:
- `token`: 认证令牌（必填）
- `type`: 文件类型，默认 video（可选）
- `video_type`: 视频类型，默认 normal（可选）
- `check`: 文件MD5校验值（必填）
- `name`: 文件名（必填）
- `length`: 文件大小，字节（必填）
- `upload_only`: 是否仅上传，默认 false（可选）
- `custom_name_support`: 是否支持自定义名称，默认 false（可选）
- `mediaprops`: 媒体属性，JSON格式（可选）

**响应**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "fileToken": "xxx",
    "mediaId": "xxx",
    "length": 1024
  }
}
```

#### 上传视频分片

```
POST /open/video/upload?token=xxx&type=video&video_type=normal&filetoken=xxx&filelength=xxx&filecheck=xxx
     &chunksize=xxx&startloc=xxx&chunkindex=xxx&chunkcount=xxx&sectioncheck=xxx
```

**请求体**: 二进制分片数据

**参数**:
- `token`: 认证令牌（必填）
- `type`: 文件类型，默认 video（可选）
- `video_type`: 视频类型，默认 normal（可选）
- `filetoken`: 文件上传凭证，从init接口获取（必填）
- `filelength`: 文件总大小，字节（必填）
- `filecheck`: 文件MD5校验值（必填）
- `chunksize`: 当前分片大小，字节（必填）
- `startloc`: 当前分片在文件中的起始位置，字节偏移量（必填）
- `chunkindex`: 当前分片索引，从1开始（必填）
- `chunkcount`: 总分片数量（必填）
- `sectioncheck`: 当前分片的MD5校验值（必填）

**响应（非最后一个分片）**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "complete": false
  }
}
```

**响应（最后一个分片）**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "complete": true,
    "fmid": "xxx",
    "url": "xxx"
  }
}
```

---

## 错误码说明

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| 0 | 成功 | - |
| 40001 | 参数缺失：token、check、name 或 length | 检查必填参数 |
| 40002 | 参数缺失或超限 | 检查必填参数 |
| 40100 | Token 无效或已过期 | 重新获取 Token |
| 42900 | 频率限制，超过每日调用次数上限 | 等待次日重试 |
| 50000 | 服务器内部错误 | 稍后重试 |
| 50001 | 操作失败 | 检查参数后重试 |

---

## 命令快速索引

| 功能 | 命令 | 说明 |
|------|------|------|
| 登录 | `node weibo-video.js login` | 登录并获取 Token（首次使用） |
| 刷新 Token | `node weibo-video.js refresh` | 手动刷新令牌（通常无需手动执行） |
| 上传视频 | `node weibo-video.js upload --file="path"` | 上传本地视频文件 |
| 帮助 | `node weibo-video.js help` | 显示帮助信息 |

---

## 完整示例

### 方式一：使用交互式登录（推荐）

```bash
# 首次使用，登录并配置（会启动交互式向导）
node scripts/weibo-video.js login

# 登录后，直接执行命令（自动使用缓存的 Token）
# 上传视频
node scripts/weibo-video.js upload --file="/path/to/video.mp4"

# 上传视频（指定视频类型）
node scripts/weibo-video.js upload --file="/path/to/video.mp4" --video-type=normal

# 查看帮助信息
node scripts/weibo-video.js help
```

---

## 配置文件说明

| 文件路径 | 说明 |
|----------|------|
| `~/.weibo-video/config.json` | 本地配置文件，存储加密后的 App ID 和 App Secret |
| `~/.weibo-video/token-cache.json` | Token 缓存文件，存储当前有效的 Token |
| `~/.openclaw/openclaw.json` | OpenClaw 配置文件（可选） |

> **安全说明**：配置文件中的敏感信息（App ID 和 App Secret）会使用 AES-256-GCM 加密存储，密钥基于机器特征生成。配置文件权限设置为 600（仅所有者可读写）。

---

## 最佳实践

1. **首次使用先登录** — 运行 `login` 命令完成配置，后续命令会自动使用缓存的 Token
2. **Token 自动管理** — 脚本会自动管理 Token 的缓存和刷新，无需手动处理
3. **网络稳定** — 上传大文件时确保网络稳定，避免上传中断
4. **文件格式** — 确保视频文件格式被微博平台支持（如 mp4、mov 等）
5. **错误重试** — 遇到 `42900` 频率限制时，等待到第二天重试；遇到 `50000` 服务器错误时，可适当重试
6. **保管好凭证** — 配置文件已加密存储，但仍需注意不要泄露原始凭证

---

## 支持的视频格式

微博平台通常支持以下视频格式：

- MP4（推荐）
- MOV
- AVI
- WMV
- FLV

> **建议**：使用 MP4 格式，H.264 编码，以获得最佳兼容性。
