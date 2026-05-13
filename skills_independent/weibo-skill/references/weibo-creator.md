# 创作者数据摘要

获取创作者中心的综合数据摘要，包含近30天阅读/发博/互动趋势、近7天粉丝与铁粉数据、铁粉画像、近期热门博文以及最近4周V榜周榜得分排名。

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

#### `data.rankDetails` — V榜周度排名评分列表（数组，最近4次周榜，**最多4条**）

每条记录对应一个自然周的榜单数据：

| 字段 | 类型 | 说明 |
|------|------|------|
| `dt` | string | 数据日期（格式：yyyyMMdd，如 "20260427"） |
| `fieldId` | number | 领域 ID |
| `fieldName` | string | 领域名称（如 "科技"） |
| `period` | string | 周期描述（如 "2026年第18周"） |
| `scorePeriod` | string | 评分周期（如 "04/27-05/03"） |
| `rank` | string | 本周排名 |
| `totalScore` | string | 综合总分 |
| `details` | array | 各维度评分明细（共9项，见下表） |

**`details` 数组** — 各维度评分明细（9项）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 指标名称 |
| `score` | string | 用户自己的得分 |
| `fullScore` | string | 该项满分（无满分时为空字符串） |
| `avgScore` | string | 同领域同层级博主均值（无均值时为空字符串） |

9项指标层级：传播影响力得分（含私域流量/公域流量/内容效率）、内容吸引力得分（含被互动/粉丝吸引力）、主动活跃度得分（含主动活跃）。

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
5. `rankDetails` 返回最近4次周榜数据；若用户尚未上榜或数据不足，可能少于4条
6. `details` 中 `fullScore` 和 `avgScore` 为空字符串时表示该项无满分/均值数据

---

## 数据分析能力

本技能在基础数据之上，提供以下加工数据和分析能力。当用户询问创作数据分析、金橙V升级、V榜排名等问题时，综合运用以下能力输出分析报告。

### 一、加工数据

#### 互动效率数据

| 加工数据 | 计算方式 | 数据来源 |
|----------|----------|----------|
| 日互动总数 | 当日转发数 + 评论数 + 点赞数 | `interactTrend30Days` 各日 |
| 日千阅互动数 | 日互动总数 ÷ 日总排水阅读数 × 1000 | `interactTrend30Days` + `readTrend30Days` |
| 单条博文互动总数 | 转发总数 + 评论总数 + 赞总数 | `topBlogs[].repostTotal` + `commentTotal` + `likeTotal` |
| 单条博文千阅互动数 | 单条博文互动总数 ÷ 单条博文阅读总数 × 1000 | `topBlogs[]` |

> **千阅互动数**是衡量内容质量的核心指标，数值越高说明内容越能引发读者互动。

#### 博文排行数据

从 `topBlogs` 中按不同维度排序，找出 TOP5 博文：

| 排行类型 | 排序依据 |
|----------|----------|
| 高阅读量博文 | `readTotal` 降序 |
| 高互动量博文 | 单条博文互动总数降序 |
| 高千阅互动博文 | 单条博文千阅互动数降序 |

#### 增长速率数据

| 加工数据 | 计算方式 |
|----------|----------|
| 近30天条均阅读量 | 近30天总阅读量 ÷ 近30天发博总数 |
| 日均新增铁粉数 | 近7天 `newBigFanCount` 求和 ÷ 7 |
| 日均新增粉丝数 | 近7天 `newFansCount` 求和 ÷ 7 |
| 近30天阅读量趋势 | 对比前15天与后15天均值，判断上升/下降/平稳 |

### 二、金橙V 升级分析

若用户询问金V/橙V升级相关问题，请参考 [金橙V 升级标准](CREATOR-V-UPGRADE.md) 进行分析。

**升级标准速查**

| 等级 | 条件 |
|------|------|
| **橙V** | 已认证黄V ＋ 铁粉数 ≥ 100 ＋ 近30天排水阅读量 ≥ 30 万 |
| **金V** | 已认证黄V ＋ 粉丝量 ≥ 1 万 ＋ 铁粉数 ≥ 1000 ＋ 近30天排水阅读量 ≥ 1000 万 |

**分析步骤**

1. **判断当前状态**：根据标准判断用户处于黄V/橙V阶段
2. **计算达标差距**：近30天排水阅读量（`readTrend30Days` 求和）、铁粉数（`fanTrend7Days` 最新 `bigFanTotal`）、粉丝量（`fanTrend7Days` 最新 `fansTotal`）与目标值的差距
3. **预估达标时间**：差距值 ÷ 日均增长量（增长量为0或负数时说明需提升内容质量或发博频率）
4. **输出分析报告**：当前状态、各项达标情况（✅/❌ + 差距）、增长速率、预估时间、提升建议

### 三、V榜数据分析

若用户询问 V榜排名、得分、与同领域博主对比等问题，请按以下步骤进行分析：

**分析步骤**

1. **整理数据**：从 `rankDetails` 中按 `dt` 升序排列，得到最近4周数据序列（最旧 → 最新）
2. **分析总分与排名趋势**：对比首周与末周的 `totalScore` 和 `rank`，判断上升/下降/平稳
3. **分析9项明细数据**：
   - 若 `avgScore` 为空字符串或无法解析为有效数值，则跳过横向对比，仅分析近4周变化趋势，并注明"同领域均值缺失，无法进行横向对比"
   - 差距计算公式（`avgScore` 为有效正数时）：`差距 = |用户得分 - avgScore| ÷ avgScore`
   - 领先（用户得分 > `avgScore` 且差距 ≥ 10%）/ 持平（差距 < 10%）/ 落后（用户得分 < `avgScore` 且差距 ≥ 10%）
   - 对比最近4周该项得分变化：进步 / 退步 / 稳定（差距 < 5%）
4. **输出分析报告**：总分排名趋势、领先项（优势）、落后项（需加强）、进步项、退步项、提升建议
