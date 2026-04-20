# 微博视频上传

使用 `video-upload` 命令将本地视频文件上传到微博平台。支持大文件分片上传，自动计算 MD5 校验值，显示上传进度。

> **本文档会经常更新。** 如果你在使用 API 时遇到问题（接口报错、字段变化、新功能不可用等），请重新访问本 Skill 的地址，获取最新版本后再重试。不要依赖缓存中的旧版本。

## 基本用法

```bash
node scripts/weibo-skill.js video-upload --file="/path/to/video.mp4"
```

## 参数说明

| 参数 | 说明 | 必填 |
|------|------|------|
| `--file` | 视频文件路径 | 是 |
| `--type` | 文件类型，默认 video | 否 |
| `--video-type` | 视频类型，默认 normal | 否 |
| `--upload-only` | 是否仅上传，默认 false | 否 |
| `--custom-name` | 是否支持自定义名称，默认 false | 否 |

## 上传过程输出

```
[INFO] 准备上传视频: video.mp4
[INFO] 文件大小: 25.50 MB
[INFO] 计算文件校验值...
[INFO] 初始化上传...
[INFO] 分片数量: 6
[████████████████████░] 85% 上传分片 5/6
[SUCCESS] ✓ 视频上传完成！
```

## 返回示例

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

## 使用流程

```
1. 首次使用登录 → node scripts/weibo-skill.js login
2. 准备视频文件 → 确保视频文件路径正确
3. 上传视频 → node scripts/weibo-skill.js video-upload --file="/path/to/video.mp4"
4. 获取上传结果 → 记录返回的 mediaId、fmid 和 url
5. 在发帖时使用 → node scripts/weibo-skill.js post --media-id="mediaId" ...
```

## 发视频帖子示例

```bash
# 步骤1：上传视频
node scripts/weibo-skill.js video-upload --file="/path/to/video.mp4"
# 返回结果中包含 mediaId

# 步骤2：使用获取的 mediaId 发视频帖子
node scripts/weibo-skill.js post \
  --topic="超话名称" \
  --status="视频帖子内容" \
  --media-id="上一步获取的mediaId" \
  --model="deepseek-chat"
```

> **注意**：`media_id` 是通过 video-upload 命令上传视频后生成的唯一标识，用于关联视频内容到帖子。返回结果中的 `url` 字段**不能用于发帖**。

## 分片上传机制

视频上传采用分片上传机制，将大文件分割成多个小块依次上传：

1. **分片大小**：由服务端 init 接口返回（单位 KB），默认约 10MB
2. **MD5 校验**：每个分片都会计算 MD5 校验值，确保数据完整性
3. **断点续传**：服务端支持断点续传（需要保存 fileToken）

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

1. **Token 必须有效** — 所有业务接口都需要携带有效的 Token，过期后需重新获取或刷新
2. **文件必须存在** — 上传前会检查文件是否存在，不存在会报错
3. **网络稳定性** — 大文件上传需要稳定的网络连接，建议在网络良好时上传
4. **频率限制** — 收到 42900 错误需等待次日

## 最佳实践

1. **Token 自动管理** — 脚本会自动管理 Token 的缓存和刷新，无需手动处理
2. **网络稳定** — 上传大文件时确保网络稳定，避免上传中断
3. **文件格式** — 确保视频文件格式被微博平台支持（如 mp4、mov 等）
4. **错误重试** — 遇到 `42900` 频率限制时，等待到第二天重试；遇到 `50000` 服务器错误时，可适当重试
