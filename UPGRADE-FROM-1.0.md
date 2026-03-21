# 从 1.0.x 版本升级指南

本文档介绍如何从 1.0.x 版本升级到最新版本。

## 适用场景

如果您已经通过 npm 包安装了 1.0.x 版本的插件：

```bash
openclaw plugins install @wecode-ai/weibo-openclaw-plugin
```

请按照下面的步骤升级到最新版本。

---

## 升级步骤

### 方式一：使用 update 命令（推荐）

```bash
openclaw plugins update weibo-openclaw-plugin
```
---

## 验证升级

```bash
openclaw plugins list
```

确认 `weibo-openclaw-plugin` 显示为最新版本并处于 `loaded` 状态。

---

## 常见问题

### Q: 升级后需要重新配置凭证吗？

**A:** 不需要。您的凭证（`appId` 和 `appSecret`）保存在 `channels.weibo` 配置中，与插件版本无关，升级后会自动保留。

### Q: 如何查看当前安装的版本？

**A:** 运行以下命令查看插件详情：

```bash
openclaw plugins list
```

---

## 相关链接

- [升级指南索引](UPGRADE.md)
- [从 Git Clone 安装升级](UPGRADE-FROM-GIT.md)
- [插件主页](https://github.com/wecode-ai/openclaw-weibo)
- [OpenClaw 文档](https://openclaw.dev)
