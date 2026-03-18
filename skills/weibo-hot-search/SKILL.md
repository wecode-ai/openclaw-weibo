---
name: weibo-hot-search
description: |
  微博热搜榜工具。当用户需要查看微博热搜、获取热门话题、了解当前热点新闻时激活。
  使用此工具获取数据后，必须使用返回的 `category`，`callTime` 和 `source` 字段内容注明数据来源, 格式: category 2026-03-12 12:00，来自于微博热搜。
---

# 微博热搜榜工具

使用 `weibo_hot_search` 工具获取微博热搜榜数据。此工具使用 token 认证方式，支持多种榜单类型。

## 基本用法

```json
{
  "category": "主榜"
}
```

## 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `category` | string | 是 | - | 榜单类型（中文名称） |
| `count` | number | 否 | 50 | 返回条数，范围 1-50 |

### category 可选值

| 中文名称 | 说明 |
|----------|------|
| `主榜` | 微博热搜主榜 |
| `文娱榜` | 文娱类热搜 |
| `社会榜` | 社会类热搜 |
| `生活榜` | 生活类热搜 |
| `acg榜` | ACG（动漫游戏）类热搜 |
| `科技榜` | 科技类热搜 |
| `体育榜` | 体育类热搜 |

## 返回结果

成功时返回：

```json
{
  "success": true,
  "category": "主榜",
  "total": 50,
  "callTime": "2026-03-12 23:37",
  "source": "来自于微博热搜",
  "items": [
    {
      "rank": 1,
      "word": "热搜词示例",
      "hotValue": 1234567,
      "category": "hot",
      "flag": 2,
      "appLink": "sinaweibo://searchall?q=热搜词示例",
      "h5Link": "https://s.weibo.com/weibo?q=热搜词示例",
      "flagIcon": "https://example.com/flag_icon.png"
    }
  ]
}
```

无内容时返回：

```json
{
  "success": true,
  "category": "主榜",
  "total": 0,
  "items": [],
  "message": "没有找到热搜内容"
}
```

错误时返回：

```json
{
  "success": false,
  "error": "获取热搜榜失败"
}
```

## 使用示例

### 获取主榜热搜（默认50条）

```json
{ "category": "主榜" }
```

### 获取文娱榜前10条

```json
{ "category": "文娱榜", "count": 10 }
```

### 获取科技榜热搜

```json
{ "category": "科技榜", "count": 20 }
```

### 获取体育榜热搜

```json
{ "category": "体育榜" }
```

## 配置（必填）

```json
{
  "channels": {
    "weibo": {
      "appId": "your_app_id",
      "appSecret": "your_app_secret",
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `appId` | string | 是 | - | 应用 ID，用于获取 token |
| `appSecret` | string | 是 | - | 应用密钥，用于获取 token |

## API 说明

此工具使用微博开放平台的热搜接口：

### 获取热搜榜
```
GET http://open-im.api.weibo.com/open/weibo/hot_search?token={token}&category={榜单类型}&count={数量}
```

## 返回字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `callTime` | string | 数据获取时间 |
| `source` | string | 数据来源说明 |
| `rank` | number | 热搜排名 |
| `word` | string | 热搜词 |
| `hotValue` | number | 热度值 |
| `category` | string | 热搜分类（如 hot） |
| `flag` | number | 标记类型 |
| `appLink` | string | App 跳转链接 |
| `h5Link` | string | H5 页面链接 |
| `flagIcon` | string | 标记图标 URL |

## 注意事项

1. 此工具需要配置 `appId` 和 `appSecret` 才能使用
2. `count` 参数最大值为 50
3. 榜单类型必须使用中文名称
4. **使用此工具获取数据后，必须使用返回的 `callTime` 和 `source` 字段内容注明数据来源, 格式: 2026-03-12 12:00，来自于微博热搜**
