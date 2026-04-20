# 微博热搜榜

使用 `hot-search` 命令获取微博热搜榜数据。支持多种榜单类型，使用 Token 认证方式。

使用此工具获取数据后，必须使用返回的 `category`，`callTime` 和 `source` 字段内容注明数据来源，格式：`{category} {callTime}，{source}`。

## 基本用法

```bash
node scripts/weibo-skill.js hot-search --category="主榜"
```

## 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--category` | string | 是 | - | 榜单类型（中文名称） |
| `--count` | number | 否 | 50 | 返回条数，范围 1-50 |

### `--category` 可选值

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

错误时返回：

```json
{
  "success": false,
  "error": "获取热搜榜失败"
}
```

## 使用示例

### 获取主榜热搜（默认 50 条）

```bash
node scripts/weibo-skill.js hot-search --category="主榜"
```

### 获取文娱榜前 10 条

```bash
node scripts/weibo-skill.js hot-search --category="文娱榜" --count=10
```

### 获取科技榜热搜

```bash
node scripts/weibo-skill.js hot-search --category="科技榜" --count=20
```

### 获取体育榜热搜

```bash
node scripts/weibo-skill.js hot-search --category="体育榜"
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

1. 需要先执行 `login` 命令完成配置
2. `--count` 参数最大值为 50
3. 榜单类型必须使用中文名称
4. **使用此工具获取数据后，必须使用返回的 `callTime` 和 `source` 字段内容注明数据来源，格式：`2026-03-12 12:00，来自于微博热搜`**
