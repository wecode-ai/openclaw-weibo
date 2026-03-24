/**
 * 微博测试客户端
 *
 * 功能：
 * 1. 自动获取/刷新 Token
 * 2. WebSocket 连接
 * 3. 发送/接收消息
 * 4. 处理 Token 过期重连
 */

import { createWeiboClient } from "./src/client.js";
import { resolveWeiboAccount } from "./src/accounts.js";
import { fetchWeiboToken } from "./src/token.js";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

// ==================== TEST ONLY - 本地测试配置 ====================
// ⚠️ 警告：以下配置仅用于本地测试

// 测试用户 ID 常量
const TEST_USER_ID = "123456789";

const TEST_CONFIG: OpenClawConfig = {
  channels: {
    weibo: {
      enabled: true,
      appId: "weibo_test_app",
      appSecret: "weibo_test_secret_key_123456",
      wsEndpoint: "ws://localhost:9999",
      tokenEndpoint: "http://127.0.0.1:9810/open/auth/ws_token",
      allowFrom: [TEST_USER_ID],
    },
  },
};

async function main() {
  console.log("═════════════════════════════════════════");
  console.log("     微博插件测试客户端");
  console.log("═════════════════════════════════════════\n");

  const account = resolveWeiboAccount({
    cfg: TEST_CONFIG,
    accountId: "default",
  });

  console.log("📋 账户信息:");
  console.log(`   - Account ID: ${account.accountId}`);
  console.log(`   - Configured: ${account.configured}`);
  console.log(`   - App ID: ${account.appId}`);
  console.log(`   - WebSocket: ${account.wsEndpoint}`);
  console.log(`   - Token API: ${account.tokenEndpoint}\n`);

  // 先获取一次 token
  console.log("🔑 步骤 1: 获取 Token...");
  try {
    const tokenResult = await fetchWeiboToken(account, account.tokenEndpoint);
    console.log(`   ✅ Token 获取成功!`);
    console.log(`      Token: ${tokenResult.token.substring(0, 30)}...`);
    console.log(`      过期时间: ${tokenResult.expiresIn}秒\n`);
  } catch (err) {
    console.error("   ❌ Token 获取失败:", err);
    process.exit(1);
  }

  // 创建 WebSocket 客户端
  console.log("🔌 步骤 2: 连接 WebSocket...\n");

  const client = createWeiboClient(account, {
    autoReconnect: true,
    maxReconnectAttempts: 0, // 无限重连

    onOpen: () => {
      console.log("\n✅ WebSocket 连接成功!");
      console.log("   发送测试消息...\n");

      // 发送测试消息
      client.send({
        type: "send_message",
        payload: {
          toUserId: TEST_USER_ID,
          text: "Hello from test client! 这是一条测试消息。",
          messageId: `msg_${Date.now()}`,
          chunkId: 0,
          done: true,
        },
      });
    },

    onMessage: (data) => {
      const msg = data as { type: string; payload: unknown };

      if (msg.type === "message") {
        const payload = msg.payload as {
          messageId: string;
          fromUserId: string;
          text: string;
          timestamp: number;
        };
        console.log("📨 收到消息:");
        console.log(`   - 消息ID: ${payload.messageId}`);
        console.log(`   - 发送者: ${payload.fromUserId}`);
        console.log(`   - 内容: ${payload.text}`);
        console.log(`   - 时间: ${new Date(payload.timestamp).toLocaleTimeString()}\n`);
      } else if (msg.type === "system") {
        console.log("ℹ️  系统消息:", JSON.stringify(msg.payload, null, 2), "\n");
      }
    },

    onError: (err) => {
      console.error("\n❌ WebSocket 错误:", err.message);
    },

    onClose: (code, reason) => {
      console.log(`\n🔌 连接断开 (code: ${code}, reason: ${reason})`);
      if (code === 4004) {
        console.log("   ⚠️ Token 过期，客户端应该自动刷新并重连...\n");
      }
    },
  });

  // 连接
  try {
    await client.connect();
  } catch (err) {
    console.error("\n❌ 连接失败:", err);
    process.exit(1);
  }

  // 保持运行
  console.log("═════════════════════════════════════════");
  console.log("   测试客户端运行中...");
  console.log("   按 Ctrl+C 退出");
  console.log("═════════════════════════════════════════\n");

  console.log("可以测试的场景:");
  console.log("1. 观察自动接收的消息（每10秒一条）");
  console.log("2. 等待60秒，观察Token过期后自动刷新");
  console.log("3. 停止服务器(按Ctrl+C)，观察重连机制");
  console.log("4. 重新启动服务器，观察自动恢复连接\n");

  // 定期打印状态
  setInterval(() => {
    const status = client.isConnected() ? "已连接" : "未连接";
    console.log(`[${new Date().toLocaleTimeString()}] 连接状态: ${status}`);
  }, 30000);
}

main().catch(console.error);
