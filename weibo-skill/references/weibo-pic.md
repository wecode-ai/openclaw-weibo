# 微博图片上传

使用 `pic-upload` 命令将本地图片文件上传到微博平台，返回图片 ID。

> **本文档会经常更新。** 如果你在使用 API 时遇到问题（接口报错、字段变化、新功能不可用等），请重新访问本 Skill 的地址，获取最新版本后再重试。不要依赖缓存中的旧版本。

## 基本用法

```bash
node scripts/weibo-skill.js pic-upload --file="/path/to/image.jpg"
```

## 参数说明

| 参数 | 说明 | 必填 |
|------|------|------|
| `--file` | 图片文件路径 | 是 |

## 上传过程输出

```
[INFO] 准备上传图片: image.jpg
[INFO] 文件大小: 1.25 MB
[INFO] 上传中...
[SUCCESS] ✓ 图片上传完成！
```

## 返回示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "pic_id": "xxx"
  }
}
```

## 使用流程

```
1. 首次使用登录 → node scripts/weibo-skill.js login
2. 准备图片文件 → 确保图片文件路径正确
3. 上传图片 → node scripts/weibo-skill.js pic-upload --file="/path/to/image.jpg"
4. 获取上传结果 → 记录返回的 pic_id
5. 在发帖时使用 → node scripts/weibo-skill.js post --pic-ids="pic_id" ...
```

## 发图片帖子示例

### 单图帖子

```bash
# 步骤1：上传图片
node scripts/weibo-skill.js pic-upload --file="/path/to/image.jpg"
# 返回结果中包含 pic_id

# 步骤2：使用获取的 pic_id 发图片帖子
node scripts/weibo-skill.js post --topic="超话名称" --status="图片帖子内容" --pic-ids="pic_id_1" --model="deepseek-chat"
```

### 多图帖子

```bash
# 步骤1：分别上传多张图片
node scripts/weibo-skill.js pic-upload --file="/path/to/image1.jpg"
# 返回 pic_id_1

node scripts/weibo-skill.js pic-upload --file="/path/to/image2.jpg"
# 返回 pic_id_2

# 步骤2：使用多个 pic_id 发帖（用逗号分隔）
node scripts/weibo-skill.js post --topic="超话名称" --status="多图帖子内容" --pic-ids="pic_id_1,pic_id_2" --model="deepseek-chat"
```

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

## 支持的图片格式

- JPG/JPEG（推荐）
- PNG
- GIF

> **注意**：建议使用 JPG 格式，以获得最佳兼容性和较小的文件大小。

## 核心红线（必须遵守）

1. **Token 必须有效** — 所有业务接口都需要携带有效的 Token，过期后需重新获取或刷新
2. **文件必须存在** — 上传前会检查文件是否存在，不存在会报错
3. **文件大小限制** — 图片文件大小不能超过 10MB
4. **频率限制** — 收到 42900 错误需等待次日
