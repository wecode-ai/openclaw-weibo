# OpenClaw 微博插件升级指南

本文档介绍如何从旧版本（通过 `git clone` 安装）升级到新版本（通过 npm 包安装）。

## 升级前提

如果您之前通过以下方式安装了旧版本插件：

```bash
git clone https://github.com/wecode-ai/openclaw-weibo.git
cd openclaw-weibo
openclaw plugins install .
```

请按照下面的步骤升级到新版本。

---

## macOS / Linux 升级步骤

### 步骤 1：删除旧插件目录

```bash
rm -rf ~/.openclaw/extensions/weibo
```

### 步骤 2：移除旧插件配置

打开配置文件：
```bash
openclaw plugins uninstall weibo
```

### 步骤 3：安装新版本插件

```bash
openclaw plugins install @wecode-ai/weibo-openclaw-plugin
```

### 步骤 4：验证安装

```bash
openclaw plugins list
```

确认 `weibo-openclaw-plugin` 已正确安装。

---

## Windows 升级步骤

### 步骤 1：：删除旧插件目录

**手动删除删除插件目录下的旧插件目录**
文件目录
```bash
C:\Users\your_username\.openclaw\extensions\weibo
```

**PowerShell** 或 **命令提示符**：
**PowerShell：**
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.openclaw\extensions\weibo"
```
**命令提示符 (CMD)：**
```cmd
rmdir /s /q "%USERPROFILE%\.openclaw\extensions\weibo"
```

### 步骤 2：编辑配置文件，移除旧插件配置

```powershell
openclaw plugins uninstall weibo
```

### 步骤 2：安装新版本插件

```powershell
openclaw plugins install @wecode-ai/weibo-openclaw-plugin
```

### 步骤 3：验证安装

```powershell
openclaw plugins list
```

确认 `weibo-openclaw-plugin` 已正确安装。

---

## 常见问题

### Q: 升级后需要重新配置凭证吗？

**A:** 不需要。您之前配置的凭证（`appId` 和 `appSecret`）保存在 `channels.weibo` 配置中，与插件安装配置是分开的，升级后会自动保留。

### Q: 如何确认旧插件已完全卸载？

**A:** 检查以下两点：
1. `~/.openclaw/extensions/weibo` 目录（Windows: `%USERPROFILE%\.openclaw\extensions\weibo`）不存在
2. 配置文件中 `plugins.entries` 和 `plugins.installs` 中没有 `weibo` 条目

### Q: 升级后插件功能有变化吗？

**A:** 新版本插件功能与旧版本保持一致，主要改进了安装和更新方式。后续可以通过以下命令轻松更新：
```bash
openclaw plugins update weibo-openclaw-plugin
```

---

## 相关链接

- [插件主页](https://github.com/wecode-ai/openclaw-weibo)
- [OpenClaw 文档](https://openclaw.dev)
