---
name: weibo-creator
description: |
  微博创作者数据工具。获取创作者中心的综合数据摘要，包含近30天阅读/发博/互动趋势、
  近7天粉丝与铁粉数据、铁粉画像（分布/性别/年龄/地区/兴趣/来源）以及近期热门博文详情。
  当用户需要了解自己的创作数据、粉丝增长情况、内容表现或铁粉画像时激活；
  或当用户询问如何升级橙V/金V、距离升级还差多少、需要多长时间能达标时激活。
metadata:
  version: "1.0.1"
---

# 微博创作者数据工具

本技能通过脚本 `scripts/weibo-creator.js` 调用创作者中心接口，一次性获取多维度创作数据摘要；并内置金橙V升级分析能力，可根据数据自动计算达标差距与策略规划。

## 脚本调用方式

```bash
node scripts/weibo-creator.js summary --token=<token>
```

**参数说明**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `--token` | 是 | 微博 API 访问令牌，通过 `weibo_token` 工具获取 |

---

## 返回数据结构

接口路径：`GET /open/creator/summary`

返回的 `data` 字段为 `CreatorSummary` 对象，包含以下维度：

### 1. 近30天阅读数据

#### `data.readTrend30Days` — 每日阅读趋势（数组，T-1 至 T-31，共30条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `totalReadCount` | number | 当日总排水阅读数 |

#### `data.readSourceSummary30Days` — 近30日分场景阅读汇总

| 字段 | 类型 | 说明 |
|------|------|------|
| `followReadCount` | number | 关注流阅读数（私域流量） |
| `followReadRate` | string | 关注流阅读占比（%，如 "55.8"） |
| `profileReadCount` | number | 个人主页阅读数（私域流量） |
| `profileReadRate` | string | 个人主页阅读占比（%） |
| `searchReadCount` | number | 搜索阅读数（公域流量） |
| `searchReadRate` | string | 搜索阅读占比（%） |
| `hotReadCount` | number | 推荐阅读数（公域流量） |
| `hotReadRate` | string | 推荐阅读占比（%） |
| `othersReadCount` | number | 其他阅读数 |
| `othersReadRate` | string | 其他阅读占比（%） |

> 关注流 + 个人主页 = 私域流量；搜索 + 推荐 = 公域流量。

---

### 2. 近30天发博活跃数据

#### `data.postTrend30Days` — 每日发博趋势（数组，T-1 至 T-31，共30条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `statusCount` | number | 当日发博数 |

---

### 3. 近30天互动数据

#### `data.interactTrend30Days` — 每日互动趋势（数组，T-1 至 T-31，共30条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `repostCount` | number | 当日收到的转发数 |
| `commentCount` | number | 当日收到的评论数 |
| `likeCount` | number | 当日收到的点赞数 |

---

### 4. 近7天粉丝&铁粉数据

#### `data.fanTrend7Days` — 每日粉丝&铁粉趋势（数组，T-1 至 T-8，共7条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `fansTotal` | number | 当日粉丝总数（仅昨日有值，其余可能为 null） |
| `newFansCount` | number | 当日新增粉丝数 |
| `bigFanTotal` | number | 当日铁粉总数 |
| `newBigFanCount` | number | 当日新增铁粉数 |

---

### 5. 铁粉画像数据

#### `data.bigFanPortrait` — 铁粉画像（截止昨日 T-1 的当前值）

| 字段 | 类型 | 说明 |
|------|------|------|
| `pyramid` | object | 铁粉分布：key 为 "钻粉"/"金粉"/"铁粉"，value 为百分比字符串（如 "2.1"） |
| `gender` | object | 性别分布：key 为 "男性"/"女性"，value 为百分比字符串 |
| `age` | object | 年龄分布：key 为 "小于18"/"18-24"/"25-34"/"35-44"/"大于44"，value 为百分比字符串 |
| `province` | object | 地区分布 TOP5：key 为省份名，value 为百分比字符串 |
| `tags` | object | 兴趣分布 TOP5：key 为兴趣标签，value 为百分比字符串 |
| `source` | object | 来源场景 TOP5：key 为来源名称，value 为百分比字符串 |

---

### 6. 近期热门博文数据

#### `data.topBlogs` — 热门博文列表（最多5条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `mid` | string | 博文 mid |
| `weiboText` | string | 博文正文（截断预览） |
| `createTimeText` | string | 发博日期（格式：yyyy-MM-dd） |
| `hasVid` | number | 是否含视频（0=否 / 1=是） |
| `readTotal` | number | 单条博文阅读总数 |
| `readFans` | number | 单条博文粉丝阅读数 |
| `readNonfans` | number | 单条博文非粉丝阅读数 |
| `repostTotal` | number | 单条博文转发总数 |
| `commentTotal` | number | 单条博文评论总数 |
| `likeTotal` | number | 单条博文赞总数 |
| `interactTotal` | number | 单条博文互动总数（= 转发 + 评论 + 点赞） |

---

## 使用示例

```bash
# 获取创作者数据摘要
node scripts/weibo-creator.js summary --token=<your_token>

# 查看帮助
node scripts/weibo-creator.js help
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "uid": 1234567890,
    "readTrend30Days": [
      { "date": "2026-05-07", "totalReadCount": 12500 },
      { "date": "2026-05-06", "totalReadCount": 9800 }
    ],
    "readSourceSummary30Days": {
      "followReadCount": 45000,
      "followReadRate": "55.8",
      "profileReadCount": 8000,
      "profileReadRate": "9.9",
      "searchReadCount": 15000,
      "searchReadRate": "18.6",
      "hotReadCount": 10000,
      "hotReadRate": "12.4",
      "othersReadCount": 2700,
      "othersReadRate": "3.3"
    },
    "postTrend30Days": [
      { "date": "2026-05-07", "statusCount": 3 }
    ],
    "interactTrend30Days": [
      { "date": "2026-05-07", "repostCount": 12, "commentCount": 45, "likeCount": 230 }
    ],
    "fanTrend7Days": [
      { "date": "2026-05-07", "fansTotal": 50000, "newFansCount": 120, "bigFanTotal": 3200, "newBigFanCount": 15 }
    ],
    "bigFanPortrait": {
      "pyramid": { "钻粉": "2.1", "金粉": "18.5", "铁粉": "79.4" },
      "gender": { "男性": "42.3", "女性": "57.7" },
      "age": { "小于18": "5.2", "18-24": "28.6", "25-34": "41.3", "35-44": "18.9", "大于44": "6.0" },
      "province": { "广东": "15.2", "北京": "12.8", "上海": "10.5", "浙江": "8.3", "江苏": "7.1" },
      "tags": { "科技": "32.1", "娱乐": "25.4", "体育": "18.7", "美食": "14.2", "旅行": "9.6" },
      "source": { "推荐流": "45.3", "搜索": "22.1", "关注流": "18.6", "个人主页": "9.4", "其他": "4.6" }
    },
    "topBlogs": [
      {
        "mid": "5127468523698745",
        "weiboText": "今天分享一个有趣的技术话题...",
        "createTimeText": "2026-05-06",
        "hasVid": 0,
        "readTotal": 85000,
        "readFans": 32000,
        "readNonfans": 53000,
        "repostTotal": 320,
        "commentTotal": 580,
        "likeTotal": 2100,
        "interactTotal": 3000
      }
    ]
  }
}
```

---

## 注意事项

1. 需要有效的 `token`，可通过 `weibo_token` 工具获取
2. 阅读数据为"排水阅读"（去除刷量等异常流量后的真实阅读数）
3. `fansTotal` 字段仅昨日（T-1）有值，其余日期可能为 `null`
4. 铁粉画像数据为截止昨日的当前值，非趋势数据
5. `topBlogs` 最多返回5条近期热门博文

---

## 金橙V 升级分析

> 升级标准详见：[金橙V 升级标准](references/creator-v-upgrade.md)

获取到创作者数据摘要后，若用户询问金V/橙V升级相关问题，请按以下步骤进行分析：

### 第一步：判断当前状态

根据升级标准，结合数据判断用户所处阶段：

- **已是黄V，尚未达到橙V**：铁粉数 < 100 或近30天排水阅读量 < 30 万
- **已是橙V，尚未达到金V**：粉丝量 < 1 万 或 铁粉数 < 1000 或 近30天排水阅读量 < 1000 万

### 第二步：计算各项达标差距

对未达标的指标，计算还差多少：

| 指标 | 数据来源 | 计算方式 |
|------|----------|----------|
| 近30天排水阅读量 | `readTrend30Days` 中所有 `totalReadCount` 求和 | 目标值 − 当前值 |
| 铁粉数 | `fanTrend7Days` 中最新一条的 `bigFanTotal` | 目标值 − 当前值 |
| 粉丝量 | `fanTrend7Days` 中最新一条的 `fansTotal` | 目标值 − 当前值 |

### 第三步：计算增长速率

| 指标 | 计算方式 |
|------|----------|
| 日均新增铁粉数 | `fanTrend7Days` 中所有 `newBigFanCount` 求和 ÷ 7 |
| 日均新增粉丝数 | `fanTrend7Days` 中所有 `newFansCount` 求和 ÷ 7 |
| 近30天条均阅读量 | `readTrend30Days` 总阅读量 ÷ `postTrend30Days` 中发博总数 |
| 近30天排水阅读量变化趋势 | 对比 `readTrend30Days` 前15天与后15天的均值，判断上升/下降/平稳 |
| 近30天铁粉数变化趋势 | 对比 `fanTrend7Days` 首尾两端的 `bigFanTotal`，判断增长速度 |

### 第四步：预估达标时间

对每个未达标指标，按当前增长速率估算所需天数：

```
距离达标天数 = 差距值 ÷ 日均增长量
```

> 若日均增长量为 0 或负数，则说明当前趋势下无法自然达标，需要提升内容质量或发博频率。

### 第五步：输出分析报告

分析报告应包含以下内容：

1. **当前状态**：已达到哪个等级，距离下一级还差哪些指标
2. **各项达标情况**：逐项列出已达标 ✅ / 未达标 ❌ 及差距数值
3. **增长速率**：日均新增粉丝、日均新增铁粉、条均阅读量
4. **预估达标时间**：按当前速率，各项指标预计还需多少天
5. **提升建议**：
   - 若阅读量不足：建议提高发博频率或优化内容质量（参考条均阅读量）
   - 若铁粉数不足：建议增加与粉丝的互动，提升粉丝活跃度
   - 若粉丝量不足：建议扩大内容传播，提升公域流量占比

### 示例分析输出

```
📊 金橙V 升级分析报告

当前状态：已认证黄V，尚未达到橙V

各项指标达标情况（橙V标准）：
  ✅ 已认证黄V
  ❌ 铁粉数：当前 68，目标 100，还差 32（日均新增 2.1，预计约 16 天达标）
  ❌ 近30天排水阅读量：当前 18.5 万，目标 30 万，还差 11.5 万
       近30天共发博 24 条，条均阅读量约 7708
       按当前条均阅读量，每天需发 2 条博文，约 8 天可达标

增长趋势：
  近30天阅读量：整体呈上升趋势（后15天均值高于前15天 23%）
  近7天铁粉增长：日均新增 2.1 铁粉

建议：
  - 保持每天 2 条以上的发博频率，重点提升单条阅读量
  - 多发互动性强的内容，加速铁粉积累
```
