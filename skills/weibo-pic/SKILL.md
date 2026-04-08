---
name: weibo-pic
description: |
  微博图片上传工具。当用户需要上传本地图片文件到微博时激活。
  支持常见图片格式，返回图片 ID。
metadata:
  version: "1.0.0"
---

# 微博图片上传 Skill

微博图片上传是一个专为 AI Agent 设计的图片上传能力。在这里，Agent 可以将本地图片文件上传到微博平台。

> **本文档会经常更新。** 如果你在使用 API 时遇到问题（接口报错、字段变化、新功能不可用等），请重新访问本 Skill 的地址，获取最新版本后再重试。不要依赖缓存中的旧版本。

## 脚本调用方式

本 Skill 使用脚本 `scripts/weibo-pic.js` 完成所有接口调用。

### 配置优先级

脚本支持多种配置方式，按以下优先级加载：

1. **本地配置文件** `~/.weibo-pic/config.json`（优先级最高）
2. **OpenClaw 配置文件** `~/.openclaw/openclaw.json`

### 可用命令

| 命令 | 说明 |
|------|------|
| `login` | 登录并获取 Token（首次使用请先执行此命令） |
| `refresh` | 刷新 Token |
| `upload` | 上传本地图片文件 |
| `help` | 显示帮助信息 |

---

## 平台结构

微博图片上传 Skill 提供以下核心能力：

- **图片上传** — 将本地图片文件上传到微博平台
- **图片 ID** — 返回上传后的图片 ID
- **格式支持** — 仅支持 JPG/JPEG、PNG、GIF 格式

---

## 快速开始

### 1. 登录并获取 Token

首次使用时，运行 `login` 命令进行登录配置：

```bash
node scripts/weibo-pic.js login
```

如果没有配置信息，脚本会启动交互式配置向导，引导你输入 App ID 和 App Secret。配置完成后会自动获取 Token 并缓存。

**交互式配置流程**：
```
=== 微博图片上传配置向导 ===

请输入您的微博应用凭证信息。
如果您还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取。

请输入 App ID: your_app_id
请输入 App Secret: your_app_secret

配置已保存到: ~/.weibo-pic/config.json
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

> **Token 自动管理**：登录成功后，Token 会被缓存到 `~/.weibo-pic/token-cache.json`。后续执行其他命令时，脚本会自动使用缓存的 Token，并在过期前 60 秒自动刷新，无需手动管理。

### 2. 上传图片

登录后，使用 `upload` 命令上传图片：

```bash
node scripts/weibo-pic.js upload --file="/path/to/image.jpg"
```

**参数说明**：

| 参数 | 说明 | 必填 |
|------|------|------|
| `--file` | 图片文件路径 | 是 |

**上传过程输出**：
```
[INFO] 准备上传图片: image.jpg
[INFO] 文件大小: 1.25 MB
[INFO] 上传中...
[SUCCESS] ✓ 图片上传完成！
```

**返回示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "pic_id": "xxx"
  }
}
```

### 3. 刷新 Token

```bash
node scripts/weibo-pic.js refresh
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
3. **文件大小限制** — 图片文件大小不能超过 10MB
4. **频率限制** — 收到 42900 错误需等待次日

---

## 使用流程（推荐）

```
1. 首次使用登录 → node weibo-pic.js login（配置凭证并获取 Token）
2. 准备图片文件 → 确保图片文件路径正确
3. 上传图片 → node weibo-pic.js upload --file="/path/to/image.jpg"
4. 获取上传结果 → 记录返回的 pic_id
5. Token 会自动管理，无需手动刷新
```

> **注意**：登录后 Token 会自动缓存和刷新，无需每次手动获取。

---

## 技术细节

### API 接口说明

#### 上传图片

```
POST /open/pic/upload?token=xxx
```

**请求体**: 图片二进制数据

**参数**:
- `token`: 认证令牌（必填，URL参数）

**响应**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "pic_id": "xxx"
  }
}
```

---

## 错误码说明

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| 0 | 成功 | - |
| 40001 | 参数缺失：token | 检查必填参数 |
| 40002 | 参数缺失或超限 | 检查必填参数 |
| 40100 | Token 无效或已过期 | 重新获取 Token |
| 42900 | 频率限制，超过每日调用次数上限 | 等待次日重试 |
| 50000 | 服务器内部错误 | 稍后重试 |
| 50001 | 操作失败 | 检查参数后重试 |

---

## 命令快速索引

| 功能 | 命令 | 说明 |
|------|------|------|
| 登录 | `node weibo-pic.js login` | 登录并获取 Token（首次使用） |
| 刷新 Token | `node weibo-pic.js refresh` | 手动刷新令牌（通常无需手动执行） |
| 上传图片 | `node weibo-pic.js upload --file="path"` | 上传本地图片文件 |
| 帮助 | `node weibo-pic.js help` | 显示帮助信息 |

---

## 完整示例

### 方式一：使用交互式登录（推荐）

```bash
# 首次使用，登录并配置（会启动交互式向导）
node scripts/weibo-pic.js login

# 登录后，直接执行命令（自动使用缓存的 Token）
# 上传图片
node scripts/weibo-pic.js upload --file="/path/to/image.jpg"

# 查看帮助信息
node scripts/weibo-pic.js help
```

---

## 配置文件说明

| 文件路径 | 说明 |
|----------|------|
| `~/.weibo-pic/config.json` | 本地配置文件，存储加密后的 App ID 和 App Secret |
| `~/.weibo-pic/token-cache.json` | Token 缓存文件，存储当前有效的 Token |
| `~/.openclaw/openclaw.json` | OpenClaw 配置文件（可选） |

> **安全说明**：配置文件中的敏感信息（App ID 和 App Secret）会使用 AES-256-GCM 加密存储，密钥基于机器特征生成。配置文件权限设置为 600（仅所有者可读写）。

---

## 最佳实践

1. **首次使用先登录** — 运行 `login` 命令完成配置，后续命令会自动使用缓存的 Token
2. **Token 自动管理** — 脚本会自动管理 Token 的缓存和刷新，无需手动处理
3. **文件格式** — 确保图片文件格式为 JPG/JPEG、PNG 或 GIF（仅支持这三种格式）
4. **错误重试** — 遇到 `42900` 频率限制时，等待到第二天重试；遇到 `50000` 服务器错误时，可适当重试
5. **保管好凭证** — 配置文件已加密存储，但仍需注意不要泄露原始凭证

---

## 支持的图片格式

本工具仅支持以下图片格式：

- JPG/JPEG（推荐）
- PNG
- GIF

> **注意**：建议使用 JPG 格式，以获得最佳兼容性和较小的文件大小。
