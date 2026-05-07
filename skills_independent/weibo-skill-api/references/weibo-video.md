# 微博视频上传

> **Base URL**: `https://open-im.api.weibo.com`

将本地视频文件上传到微博平台。支持大文件分片上传，返回 `mediaId` 供发帖使用。

## 上传流程

视频上传分两步：**初始化** → **分片上传**。

---

## 第一步：初始化上传

```http
GET /open/video/init?token={token}&check={md5}&name={filename}&length={filesize}
```

**Query 参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `token` | 是 | 访问令牌 |
| `check` | 是 | 整个文件的 MD5 校验值（十六进制字符串） |
| `name` | 是 | 文件名（如 `video.mp4`） |
| `length` | 是 | 文件大小（字节数） |
| `type` | 否 | 文件类型，默认 `video` |
| `video_type` | 否 | 视频类型，默认 `normal` |
| `upload_only` | 否 | 是否仅上传，默认 `false` |
| `custom_name_support` | 否 | 是否支持自定义名称，默认 `false` |

**响应示例**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "fileToken": "upload_token_xxx",
    "mediaId": "media_id_xxx",
    "length": 10240
  }
}
```

**响应字段说明**：

| 字段 | 说明 |
|------|------|
| `fileToken` | 上传令牌，后续分片上传时使用 |
| `mediaId` | 媒体 ID，发帖时使用此值 |
| `length` | 服务端建议的分片大小（单位：KB），若为 0 则使用默认值 10240 KB（10MB） |

---

## 第二步：分片上传

将文件按分片大小切割，逐片上传。

```http
POST /open/video/upload?token={token}&filetoken={fileToken}&filelength={fileLength}&filecheck={fileMD5}&chunksize={chunkSize}&startloc={startLoc}&chunkindex={chunkIndex}&chunkcount={chunkCount}&sectioncheck={sectionMD5}
Content-Type: application/octet-stream

<当前分片的二进制内容>
```

**Query 参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `token` | 是 | 访问令牌 |
| `filetoken` | 是 | 初始化返回的 `fileToken` |
| `filelength` | 是 | 文件总大小（字节） |
| `filecheck` | 是 | 整个文件的 MD5 校验值 |
| `chunksize` | 是 | 当前分片大小（字节） |
| `startloc` | 是 | 当前分片在文件中的起始位置（字节偏移量） |
| `chunkindex` | 是 | 当前分片序号（从 1 开始） |
| `chunkcount` | 是 | 总分片数 |
| `sectioncheck` | 是 | 当前分片的 MD5 校验值 |
| `type` | 否 | 文件类型，默认 `video` |
| `video_type` | 否 | 视频类型，默认 `normal` |

**最后一片响应示例**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "complete": true,
    "fmid": "fmid_xxx",
    "url": "https://video.weibo.com/xxx"
  }
}
```

**中间分片响应示例**：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "complete": false
  }
}
```

---

## 分片计算方法

```
分片大小 = init 响应中的 data.length * 1024（字节）
         若 data.length 为 0，则使用默认值 10 * 1024 * 1024（10MB）
         若分片大小 >= 文件大小，则分片大小 = 文件大小（即单片上传）

总分片数 = ceil(文件大小 / 分片大小)

第 i 片（从 1 开始）：
  startloc = (i - 1) * 分片大小
  chunksize = min(分片大小, 文件大小 - startloc)
  sectioncheck = 该分片内容的 MD5
```

---

## 完整上传流程示例

```
1. 计算文件 MD5：fileMD5 = md5(文件全部内容)
2. 初始化：GET /open/video/init?check={fileMD5}&name=video.mp4&length={fileSize}&token={token}
   → 获得 fileToken、mediaId、建议分片大小
3. 按分片大小切割文件，逐片上传：
   POST /open/video/upload?filetoken={fileToken}&chunkindex=1&chunkcount=N&...
   POST /open/video/upload?filetoken={fileToken}&chunkindex=2&chunkcount=N&...
   ...
   POST /open/video/upload?filetoken={fileToken}&chunkindex=N&chunkcount=N&...
4. 最后一片响应中 data.complete = true，上传完成
5. 使用 mediaId 发帖（不要使用 url 字段）
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

## 支持的视频格式

- MP4（推荐）
- MOV
- AVI
- WMV
- FLV

> **建议**：使用 MP4 格式，H.264 编码，以获得最佳兼容性。

## 核心红线（必须遵守）

1. **Token 必须有效** — 上传接口需要携带有效的 Token，过期后需重新获取
2. **MD5 校验** — 每个分片和整个文件都需要计算 MD5，确保数据完整性
3. **网络稳定性** — 大文件上传需要稳定的网络连接
4. **频率限制** — 收到 42900 错误需等待次日
