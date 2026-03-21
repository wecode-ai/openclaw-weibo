# OpenClaw 微博插件升级指南

本文档帮助您选择正确的升级路径。

## 选择您的升级场景

### 📦 从 Git Clone 安装升级（0.1.0 版本）

如果您之前通过以下方式安装了插件：

```bash
git clone https://github.com/wecode-ai/openclaw-weibo.git
cd openclaw-weibo
openclaw plugins install .
```

👉 请参阅 **[从 Git Clone 安装升级指南](UPGRADE-FROM-GIT.md)**

---

### 🔄 从 1.0.x 版本升级

如果您已经通过 npm 包安装了 1.0.x 版本：

```bash
openclaw plugins install @wecode-ai/weibo-openclaw-plugin
```

👉 请参阅 **[从 1.0.x 版本升级指南](UPGRADE-FROM-1.0.md)**

---

## 快速升级命令

| 升级场景 | 命令 |
|---------|------|
| 从 1.0.x 升级 | `openclaw plugins update weibo-openclaw-plugin` |
| 从 Git Clone 升级 | 需要完整迁移步骤，请参阅[详细指南](UPGRADE-FROM-GIT.md) |

---

## 相关链接

- [插件主页](https://github.com/wecode-ai/openclaw-weibo)
- [OpenClaw 文档](https://openclaw.dev)
