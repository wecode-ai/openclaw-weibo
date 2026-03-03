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

### 安装插件
```
git clone https://github.com/wecode-ai/openclaw-weibo.git
cd openclaw-weibo && openclaw plugins install .
```

## OpenClaw 配置

编辑 `~/.openclaw/openclaw.config.json`：

```json
{
  "channels": {
    "weibo": {
      "appId": "your-app-id",
      "appSecret": "your-app-secret",
    }
  }
}
```

## License

MIT
