---
name: weibo-status
description: |
  微博状态工具。当用户需要获取自己发布的微博列表、查看自己的历史微博、获取自己微博的互动数据时激活。
metadata:
  version: "1.0.0"
---

# 微博状态工具

使用 `weibo_status` 工具获取用户自己发布的微博内容。此工具使用 token 认证方式，支持分页查询。

## 基本用法

```json
{
  "tool_calls": [
    {
      "name": "weibo_status",
      "arguments": {}
    }
  ]
}
```

## 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `count` | number | 否 | 20 | 每页数量，最大 100 |


## 返回结果

### statuses 数组中的微博对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 微博唯一 ID（数字格式） |
| `mid` | string | 微博 ID（字符串格式，与 id 值相同） |
| `text` | string | 微博正文内容（转发时包含转发评论，如 `//@用户名:评论内容`） |
| `created_at` | string | 发布时间（格式：`Sun Jan 04 20:07:55 +0800 2026`） |
| `images` | array | 图片 ID 数组 |
| `has_image` | boolean | 是否有图片 |
| `reposts_count` | number | 转发数 |
| `comments_count` | number | 评论数 |
| `attitudes_count` | number | 点赞数 |
| `repost` | object | 被转发的原微博对象（仅转发微博有此字段） |

### repost 对象（被转发的原微博）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 微博唯一 ID（数字格式） |
| `mid` | string | 微博 ID（字符串格式） |
| `text` | string | 微博正文内容 |
| `created_at` | string | 发布时间 |
| `images` | array | 图片 ID 数组 |
| `has_image` | boolean | 是否有图片 |
| `reposts_count` | number | 转发数 |
| `comments_count` | number | 评论数 |
| `attitudes_count` | number | 点赞数 |
| `user` | object | 用户信息 |

### user 对象（用户信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| `screen_name` | string | 用户昵称 |


## 使用示例

### 获取最新微博（默认参数）

```json
{
  "tool_calls": [
    {
      "name": "weibo_status",
      "arguments": {}
    }
  ]
}
```

### 获取指定数量的微博

```json
{
  "tool_calls": [
    {
      "name": "weibo_status",
      "arguments": {
        "count": 20
      }
    }
  ]
}
```

### 配置项说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `appId` | string | 是 | - | 应用 ID，用于获取 token |
| `appSecret` | string | 是 | - | 应用密钥，用于获取 token |
| `weiboStatusEndpoint` | string | 否 | `https://open-im.api.weibo.com/open/weibo/user_status` | 用户微博 API 端点 |
| `tokenEndpoint` | string | 否 | `https://open-im.api.weibo.com/open/auth/ws_token` | Token 获取端点 |
| `weiboStatusEnabled` | boolean | 否 | `true` | 是否启用微博状态工具 |

## API 说明

此工具使用微博开放平台的用户时间线接口：

### 获取用户微博
```
GET https://open-im.api.weibo.com/open/weibo/user_status?token={token}&count={数量}&page={页码}&screen_name={昵称}&start_time={开始时间}&end_time={结束时间}&stat_date={月份}&feature={过滤类型}&visible={可见性}&trim_user={user开关}&fetch_data_only={仅数据}
```

## 注意事项

1. 此工具需要配置 `appId` 和 `appSecret` 才能使用
2. 返回的微博按时间倒序排列（最新的在前）
3. `count` 参数最大值为 100
