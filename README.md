# openclaw-weibo

OpenClaw Weibo DM channel plugin - 微博私信通道插件



## 使用
### 获取凭证

1. 打开微博客户端，私信 [@微博龙虾助手](https://weibo.com/u/6808810981)
2. 发送消息：`连接龙虾`
3. 收到回复示例：
   ```
   您的应用凭证信息如下：

   AppId: your-app-id
   AppSecret: your-app-secret

   如需重置凭证，请发送 "重置凭证" 命令。
   ```

### 配置OpenClaw
#### 安装插件

```bash
openclaw plugins install @wecode-ai/weibo-openclaw-plugin
```

#### 更新插件
```bash
openclaw plugins update weibo-openclaw-plugin
```

#### 配置凭证
使用命令配置：
```bash
openclaw config set 'channels.weibo.appSecret' 'your-appSecret'
openclaw config set 'channels.weibo.appId' 'your-appId'
```

或编辑 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "weibo": {
      "appId": "your-app-id",
      "appSecret": "your-app-secret"
    }
  }
}
```

#### 安装定时任务（可选）

如果需要使用微博定时任务功能（如超话自动发帖、热搜评论等），可以让 AI 帮你配置：

```bash
# 在 OpenClaw 对话中发送
安装 weibo cron 中的定时任务, weibo_uid 是 xxxx
```

AI 会根据 `weibo-cron` skill 中的配置自动添加定时任务。你也可以通过以下命令查看已配置的任务：

```bash
openclaw cron list
```

## 内置工具

插件提供以下 AI 工具，默认全部启用：

| 工具名称 | 功能说明 | 配置项 |
|---------|---------|--------|
| `weibo_crowd` | 微博超话发帖工具，支持在超话社区发帖、评论、回复 | `weiboCrowdEnabled` |
| `weibo_search` | 微博智搜工具，通过关键词获取微博智搜内容 | `weiboSearchEnabled` |
| `weibo_status` | 获取用户自己发布的微博列表 | `weiboStatusEnabled` |
| `weibo_hot_search` | 获取微博热搜榜（支持主榜、文娱榜、社会榜等） | `weiboHotSearchEnabled` |
| `weibo_token` | 微博 API 访问令牌工具，用于获取和管理访问 token | `weiboTokenEnabled` |
| `weibo_video` | 微博视频上传工具，支持大文件分片上传 | - |
| `weibo_cron` | 微博定时任务配置工具，包含可用的定时任务玩法列表及添加命令 | - |
| `weibo_pic` | 微博图片上传工具 | - |

### 关闭工具

使用命令关闭指定工具：
```bash
# 关闭微博智搜工具
openclaw config set 'channels.weibo.weiboSearchEnabled' false

# 关闭用户微博工具
openclaw config set 'channels.weibo.weiboStatusEnabled' false

# 关闭热搜榜工具
openclaw config set 'channels.weibo.weiboHotSearchEnabled' false
```

或编辑 `~/.openclaw/openclaw.config.json`：
```json
{
  "channels": {
    "weibo": {
      "appId": "your-app-id",
      "appSecret": "your-app-secret",
      "weiboSearchEnabled": false,
      "weiboStatusEnabled": false,
      "weiboHotSearchEnabled": false
    }
  },
  "plugins": {
    "allow": ["weibo-openclaw-plugin"]
  }
}
```

> **注意**：将配置值设为 `false` 可关闭对应工具，删除配置项或设为 `true` 则启用工具。

## Skill 自动更新

从 **2.2.0** 版本开始，插件支持 skill 自动更新功能。

### 特性

- **无需升级插件**：skill 更新独立于插件版本，新功能和改进会自动推送
- **自动检查**：插件运行时每 30 分钟自动检查一次更新
- **增量更新**：仅下载有新增或更新的 skill
- **其他说明**：如果下载了新的skill，但是当前会话没生效可能是由于上下文缓存，可以执行/new开启一个新会话

## 插件网络访问说明
* 插件通过域名 `open-im.api.weibo.com` 来调用微博接口。
* 如在出入口网络受限环境下使用该插件请注意配置访问权限。

## Development

```bash
npm install
npm run build
npm run test:unit
```

## License

MIT
