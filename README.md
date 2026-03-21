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

或编辑 `~/.openclaw/openclaw.config.json`：

```json
{
...existing config...
  "channels": {
    ...existing config...
    "weibo": {
      "appId": "your-app-id",
      "appSecret": "your-app-secret"
    }
  }
}
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
  }
}
```

> **注意**：将配置值设为 `false` 可关闭对应工具，删除配置项或设为 `true` 则启用工具。

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
