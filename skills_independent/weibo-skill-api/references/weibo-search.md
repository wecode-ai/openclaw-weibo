# 微博搜索

> **Base URL**: `https://open-im.api.weibo.com`

包含两个功能： 关键词智搜（返回 AI 摘要）；热搜榜（主榜/文娱/社会/生活/科技/体育等分类）。

---

## 一、智搜（关键词搜索）

通过关键词搜索微博内容，返回 AI 生成的搜索结果摘要。

使用此工具获取数据后，必须使用返回的 `query`、`callTime` 和 `source` 字段内容注明数据来源，格式：`关键词: {query}，{callTime}，{source}`。

### API 说明

```
GET /open/wis/search_query?query={query}&token={token}
```

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词，需要 URL encode |
| `token` | string | 是 | 访问令牌 |

### 返回结果

成功时返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "completed": true,
    "analyzing": false,
    "content": "AI 生成的搜索结果摘要（Markdown 格式）",
    "contentFormat": "markdown",
    "referenceCount": 5,
    "scheme": "sinaweibo://...",
    "version": "2026-03-10 01:11:33.022000-8035",
    "query": "搜索关键词",
    "callTime": "2026-03-12 23:37",
    "source": "来自于微博智搜"
  }
}
```

无内容时返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "completed": true,
    "noContent": true,
    "callTime": "2026-03-12 23:37",
    "source": "来自于微博智搜",
    "message": "没有找到相关内容"
  }
}
```

错误时返回：

```json
{
  "code": 40100,
  "message": "token invalid"
}
```

### 使用示例

#### 搜索热门话题

```http
GET /open/wis/search_query?query=%23%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%23&token={token}
```

#### 搜索特定关键词

```http
GET /open/wis/search_query?query=%E7%A7%91%E6%8A%80%E6%96%B0%E9%97%BB&token={token}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索关键词 |
| `callTime` | string | 数据获取时间 |
| `source` | string | 数据来源说明 |
| `content` | string | AI 生成的搜索结果摘要（Markdown 格式），可直接使用，无需二次处理 |
| `contentFormat` | string | 内容格式（markdown） |
| `referenceCount` | number | 引用数量 |
| `scheme` | string | App 跳转链接 |
| `completed` | boolean | 搜索是否完成 |
| `analyzing` | boolean | 是否仍在分析中 |
| `noContent` | boolean | 是否无内容（无结果时为 true） |

### 注意事项

1. `content` 字段内容可直接使用，无需二次处理
2. **使用此工具获取数据后，必须使用返回的 `callTime` 和 `source` 字段内容注明数据来源，格式：`关键词: {query}，2026-03-12 12:00，来自于微博智搜`**

---

## 二、热搜榜

获取微博热搜榜数据。支持多种榜单类型。

获取数据后，必须注明数据来源，格式：`{查询的榜单名称} {callTime}，{source}`，例如：`主榜 2026-03-12 12:00，来自于微博热搜`。

### API 说明

```
GET /open/weibo/hot_search?token={token}&category={category}&count={count}
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `token` | string | 是 | - | 访问令牌 |
| `category` | string | 是 | - | 榜单类型（中文名称，见下表，需 URL encode） |
| `count` | number | 否 | 50 | 返回条数，范围 1-50 |

#### category 可选值

| 中文名称 | 说明 |
|----------|------|
| `主榜` | 微博热搜主榜 |
| `文娱榜` | 文娱类热搜 |
| `社会榜` | 社会类热搜 |
| `生活榜` | 生活类热搜 |
| `acg榜` | ACG（动漫游戏）类热搜 |
| `科技榜` | 科技类热搜 |
| `体育榜` | 体育类热搜 |

### 返回结果

成功时返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "callTime": "2026-03-12 23:37",
    "source": "来自于微博热搜",
    "data": [
      {
        "id": 1,
        "word": "热搜词示例",
        "num": 1234567,
        "flag": 2,
        "app_query_link": "sinaweibo://searchall?q=热搜词示例",
        "h5_query_link": "https://m.weibo.cn/search?q=热搜词示例",
        "flag_link": "https://simg.s.weibo.com/20210226_hot_small.png"
      }
    ]
  }
}
```

错误时返回：

```json
{
  "code": 40100,
  "message": "token invalid"
}
```

### 使用示例

> `category` 参数为中文，需进行 URL encode。

#### 获取主榜热搜（默认 50 条）

```http
GET /open/weibo/hot_search?token={token}&category=%E4%B8%BB%E6%A6%9C
```

#### 获取文娱榜前 10 条

```http
GET /open/weibo/hot_search?token={token}&category=%E6%96%87%E5%A8%B1%E6%A6%9C&count=10
```

#### 获取科技榜热搜

```http
GET /open/weibo/hot_search?token={token}&category=%E7%A7%91%E6%8A%80%E6%A6%9C&count=20
```

### 返回字段说明

#### data 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `callTime` | string | 数据获取时间 |
| `source` | string | 数据来源说明 |

#### data.data[] 条目字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 热搜排名 |
| `word` | string | 热搜词 |
| `num` | number | 热度值 |
| `flag` | number | 标记类型（0=无标记，1=新，2=热） |
| `app_query_link` | string | App 跳转链接 |
| `h5_query_link` | string | H5 页面链接 |
| `flag_link` | string | 标记图标 URL（无标记时为空字符串） |

### 注意事项

1. `count` 参数最大值为 50
2. `category` 参数必须使用**中文名称**（如 `主榜`、`文娱榜`）
3. **获取数据后，必须注明数据来源，格式：`{查询的榜单名称} {callTime}，{source}`，例如：`主榜 2026-03-12 12:00，来自于微博热搜`**
