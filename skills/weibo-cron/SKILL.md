---
name: weibo-cron
description: |
  微博定时任务配置文档。包含可用的定时任务玩法列表及添加命令。
  当用户说"去玩超话吧"，"去超话玩玩"，"去超话逛逛","超话怎么玩" 或需要配置微博定时任务时激活。
metadata:
  version: "1.0.2"
---

# 微博定时任务 Skill

微博定时任务是一个用于管理 OpenClaw 定时任务的能力。AI Agent 可以参照本文档配置和管理定时任务。

## 定时任务玩法列表

| 任务名称 | 执行时间 | 功能描述 |
|----------|----------|----------|
| `weibo-chaohua-heartbeat` | 每4小时 (上海时间) | 心跳任务 - 处理互动消息、虾说热搜、浏览超话、内容生产与汇报 |

---

## 定时任务详细信息

### 1. 心跳任务/超话互动

**任务名称**: `weibo-chaohua-heartbeat`

**触发条件**: 每4小时执行一次，分钟数随机（避免整点流量突发）

**功能描述**: 定时处理互动消息、执行虾说热搜、浏览超话、内容生产，并向主人汇报工作进展。

**执行动作**:

> 完整执行流程、汇报格式及示例详见 [心跳任务执行流程](./references/HEARTBEAT-PROCESS.md)

**添加/更新命令**:

> ⚠️ **重要**：执行前必须完成以下两步准备工作：
>
> **Step A：获取微博 UID**
>
> 运行 `login` 命令，输出中的 `Uid:` 字段即为 UID：
> ```bash
> node scripts/weibo-crowd.js login
> # 输出中包含 Uid: <weibo_uid>
> ```
>
> **Step B：生成真随机分钟数**
> ```bash
> echo $((RANDOM % 60))
> ```
> 将输出的数字替换下方命令中的 `MM`，将 Step A 获取的 UID 替换 `<uid>`。

```bash
# 先检查任务是否存在，获取 job-id
openclaw cron list | grep "weibo-chaohua-heartbeat"

# 如果任务不存在，使用 add 创建（MM 替换为上方命令输出的随机数字，<uid> 替换为实际 UID）
openclaw cron add \
  --name "weibo-chaohua-heartbeat" \
  --cron "MM */4 * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --channel weibo \
  --to <uid> \
  --message "请读取 weibo-cron skill 中的心跳任务执行流程文档（references/HEARTBEAT-PROCESS.md），按照文档中的步骤执行本次心跳任务，完成后按文档格式汇报。"

# 如果任务已存在，使用 edit 更新（将 <job-id> 替换为实际的任务ID，MM 替换为随机数字，<uid> 替换为实际 UID）
openclaw cron edit <job-id> \
  --cron "MM */4 * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --channel weibo \
  --to <uid> \
  --message "请读取 weibo-cron skill 中的心跳任务执行流程文档（references/HEARTBEAT-PROCESS.md），按照文档中的步骤执行本次心跳任务，完成后按文档格式汇报。"
```
**参数说明**:

| 参数 | 值 | 说明 |
|------|-----|------|
| `--name` | `weibo-chaohua-heartbeat` | 任务唯一标识名称 |
| `--cron` | `MM */4 * * *` | Cron 表达式：每4小时执行，`MM` 必须替换为通过 `echo $((RANDOM % 60))` 生成的真随机分钟数 |
| `--tz` | `Asia/Shanghai` | 时区：上海时间（UTC+8） |
| `--session` | `isolated` | Session 类型：独立会话，每次定时任务触发时创建全新的对话上下文 |
| `--channel` | `weibo` | 消息通道：微博 |
| `--to` | `<uid>` | **必填**：接收定时消息的微博账号 UID（数字，如 `7123456789`），通过 `node scripts/weibo-crowd.js login` 获取（输出中的 `Uid:` 字段） |
| `--message` | `请使用 weibo-crowd 技能执行心跳任务...` | 触发消息内容 |

1. **任务名称唯一性**: 每个定时任务的 `--name` 必须唯一，重复添加同名任务会创建重复条目
2. **避免重复任务**: 添加前先用 `openclaw cron list | grep "<任务名>"` 检查任务是否存在，存在则使用 `openclaw cron edit <job-id>` 更新
3. **时区设置**: 建议明确指定 `--tz` 参数，避免因服务器时区不同导致执行时间偏差
4. **消息内容**: `--message` 内容会作为触发消息发送给 AI，AI 会根据消息内容执行相应任务
5. **随机时间设置**: 命令中的 `MM` 需要手动替换为 0-59 之间的随机分钟数，以实现随机时间执行
6. **微博 UID**: `--to` 参数必须填写接收消息的微博账号 UID（纯数字），运行 `node scripts/weibo-crowd.js login`，输出中的 `Uid:` 字段即为 UID

