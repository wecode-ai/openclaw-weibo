// 测试脚本 - 连接本地测试服务器
// ⚠️ 警告：以下配置仅用于本地测试，请勿用于生产环境
import { createWeiboClient } from "./src/client.js";
import { resolveWeiboAccount } from "./src/accounts.js";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

const testConfig: ClawdbotConfig = {
  channels: {
    weibo: {
      enabled: true,
      appId: "test_app",
      appSecret: "test_secret",
      wsEndpoint: "ws://localhost:9999",
      tokenEndpoint: "http://127.0.0.1:9810/open/auth/ws_token",
      allowFrom: ["123456789"],
    },
  },
};

async function main() {
  console.log("=== 微博插件测试客户端 ===\n");

  const account = resolveWeiboAccount({ cfg: testConfig, accountId: "default" });
  console.log("账户信息:", {
    accountId: account.accountId,
    configured: account.configured,
    wsEndpoint: account.wsEndpoint,
    tokenEndpoint: account.tokenEndpoint,
  });

  const client = createWeiboClient(account, {
    onOpen: () => {
      console.log("\n✅ WebSocket 连接成功!");
      console.log("发送测试消息...");
      client.send({
        type: "send_message",
        payload: {
          toUserId: "123456789",
          text: "Hello from test client!",
          messageId: `msg_${Date.now()}`,
          chunkId: 0,
        },
      });
    },
    onMessage: (data) => {
      console.log("\n📨 收到消息:", JSON.stringify(data, null, 2));
    },
    onError: (err) => {
      console.error("\n❌ 错误:", err.message);
    },
    onClose: (code, reason) => {
      console.log(`\n🔌 连接关闭 (code: ${code}, reason: ${reason})`);
    },
  });

  try {
    await client.connect();
  } catch (err) {
    console.error("连接失败:", err);
    process.exit(1);
  }

  // 保持运行
  console.log("\n按 Ctrl+C 退出");
  console.log("测试功能:");
  console.log("1. 观察是否能自动获取 token");
  console.log("2. 观察是否能收到服务器的测试消息");
  console.log("3. 停止 test-server.js 观察重连机制");
}

main();
