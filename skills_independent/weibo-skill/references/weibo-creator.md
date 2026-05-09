# 创作者数据摘要

获取创作者中心的综合数据摘要，包含近30天阅读/发博/互动趋势、近7天粉丝与铁粉数据、铁粉画像以及近期热门博文。

---

## 获取创作者数据摘要

使用 `creator-summary` 命令获取创作者数据摘要。

### 基本用法

```bash
node scripts/weibo-skill.js creator-summary
```

### 参数说明

无额外参数，Token 由脚本自动获取。

### 返回结果

返回的 `data` 字段为 `CreatorSummary` 对象，包含以下维度：

#### `data.uid` — 用户 uid

#### `data.readTrend30Days` — 近30天每日阅读趋势（数组，共30条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `totalReadCount` | number | 当日总排水阅读数 |

#### `data.readSourceSummary30Days` — 近30日分场景阅读汇总

| 字段 | 类型 | 说明 |
|------|------|------|
| `followReadCount` | number | 关注流阅读数（私域） |
| `followReadRate` | string | 关注流阅读占比（%） |
| `profileReadCount` | number | 个人主页阅读数（私域） |
| `profileReadRate` | string | 个人主页阅读占比（%） |
| `searchReadCount` | number | 搜索阅读数（公域） |
| `searchReadRate` | string | 搜索阅读占比（%） |
| `hotReadCount` | number | 推荐阅读数（公域） |
| `hotReadRate` | string | 推荐阅读占比（%） |
| `othersReadCount` | number | 其他阅读数 |
| `othersReadRate` | string | 其他阅读占比（%） |

#### `data.postTrend30Days` — 近30天每日发博趋势（数组，共30条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `statusCount` | number | 当日发博数 |

#### `data.interactTrend30Days` — 近30天每日互动趋势（数组，共30条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `repostCount` | number | 当日收到的转发数 |
| `commentCount` | number | 当日收到的评论数 |
| `likeCount` | number | 当日收到的点赞数 |

#### `data.fanTrend7Days` — 近7天每日粉丝&铁粉趋势（数组，共7条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期（格式：yyyy-MM-dd） |
| `fansTotal` | number | 当日粉丝总数（仅昨日有值，其余可能为 null） |
| `newFansCount` | number | 当日新增粉丝数 |
| `bigFanTotal` | number | 当日铁粉总数 |
| `newBigFanCount` | number | 当日新增铁粉数 |

#### `data.bigFanPortrait` — 铁粉画像（截止昨日的当前值）

| 字段 | 类型 | 说明 |
|------|------|------|
| `pyramid` | object | 铁粉分布：key 为 "钻粉"/"金粉"/"铁粉"，value 为百分比字符串 |
| `gender` | object | 性别分布：key 为 "男性"/"女性"，value 为百分比字符串 |
| `age` | object | 年龄分布：key 为 "小于18"/"18-24"/"25-34"/"35-44"/"大于44"，value 为百分比字符串 |
| `province` | object | 地区分布 TOP5：key 为省份名，value 为百分比字符串 |
| `tags` | object | 兴趣分布 TOP5：key 为兴趣标签，value 为百分比字符串 |
| `source` | object | 来源场景 TOP5：key 为来源名称，value 为百分比字符串 |

#### `data.topBlogs` — 近期热门博文列表（最多5条）

| 字段 | 类型 | 说明 |
|------|------|------|
| `mid` | string | 博文 mid |
| `weiboText` | string | 博文正文（截断预览） |
| `createTimeText` | string | 发博日期（格式：yyyy-MM-dd） |
| `hasVid` | number | 是否含视频（0=否 / 1=是） |
| `readTotal` | number | 单条博文阅读总数 |
| `readFans` | number | 粉丝阅读数 |
| `readNonfans` | number | 非粉丝阅读数 |
| `repostTotal` | number | 转发总数 |
| `commentTotal` | number | 评论总数 |
| `likeTotal` | number | 赞总数 |
| `interactTotal` | number | 互动总数（= 转发 + 评论 + 点赞） |

### 使用示例

```bash
node scripts/weibo-skill.js creator-summary
```

### 注意事项

1. 需要先执行 `login` 命令完成配置
2. 阅读数据为"排水阅读"（去除刷量等异常流量后的真实阅读数）
3. `fansTotal` 字段仅昨日（T-1）有值，其余日期可能为 `null`
4. 铁粉画像数据为截止昨日的当前值，非趋势数据

---

## 金橙V 升级分析

获取到创作者数据摘要后，若用户询问金V/橙V升级相关问题，请参考 [金橙V 升级标准](CREATOR-V-UPGRADE.md) 进行分析。

### 升级标准速查

**橙V 标准**：已认证黄V + 铁粉数 ≥ 100 + 近30天排水阅读量 ≥ 30 万

**金V 标准**：已认证黄V + 粉丝量 ≥ 1 万 + 铁粉数 ≥ 1000 + 近30天排水阅读量 ≥ 1000 万

### 分析步骤

1. **判断当前状态**：根据标准判断用户处于黄V/橙V阶段
2. **计算达标差距**：
   - 近30天排水阅读量 = `readTrend30Days` 中所有 `totalReadCount` 求和
   - 铁粉数 = `fanTrend7Days` 最新一条的 `bigFanTotal`
   - 粉丝量 = `fanTrend7Days` 最新一条的 `fansTotal`
3. **计算增长速率**：
   - 日均新增铁粉 = `fanTrend7Days` 中 `newBigFanCount` 求和 ÷ 7
   - 日均新增粉丝 = `fanTrend7Days` 中 `newFansCount` 求和 ÷ 7
   - 条均阅读量 = 近30天总阅读量 ÷ 近30天发博总数
4. **预估达标时间**：差距值 ÷ 日均增长量
5. **输出分析报告**：列出各项达标情况、增长速率、预估时间和提升建议
