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
```
git clone https://gitee.com/wecode-ai/openclaw-weibo.git
cd openclaw-weibo
openclaw plugins install .
openclaw gateway restart
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

## 插件网络访问说明
* 插件通过域名 `open-im.api.weibo.com` 来调用微博接口。
* 如在出入口网络受限环境下使用该插件请注意配置访问权限。

## License

MIT
