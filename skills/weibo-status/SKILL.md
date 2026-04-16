---
name: weibo-status
description: |
  微博状态工具集。包含获取用户微博列表和根据MID/URL查询单条微博两个功能。
  当用户需要获取自己发布的微博列表、查看历史微博、获取互动数据时激活；
  或当用户提供微博链接/MID、需要查看某条具体微博内容时激活。
metadata:
  version: "1.1.0"
---

# 微博状态工具集

本技能包含以下两个工具，请根据需求查阅对应文档：

## 工具目录

| 工具 | 文档 | 说明 |
|------|------|------|
| `weibo_status` | [weibo-status.md](references/weibo-status.md) | 获取用户自己发布的微博列表（tool_calls 方式） |
| `weibo-status-show` 脚本 | [weibo-status-show.md](references/weibo-status-show.md) | 根据MID或URL获取单条微博内容（脚本方式） |
