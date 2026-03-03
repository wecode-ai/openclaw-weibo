/**
 * 微博测试服务器 - 完整实现
 *
 * 功能：
 * 1. Token API - 获取和刷新 token
 * 2. WebSocket Server - 接收/发送消息
 * 3. Ping/Pong 心跳
 * 4. Token 过期模拟
 * 5. 消息广播
 */

import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { randomUUID } from "crypto";

// ==================== TEST ONLY - 测试专用配置 ====================
// ⚠️ 警告：以下凭证仅用于本地测试，生产环境请使用真实配置
const VALID_APP_ID = "weibo_test_app";
const VALID_APP_SECRET = "weibo_test_secret_key_123456";
const TOKEN_EXPIRE_SECONDS = 60;
const WS_PORT = 9999;
const TOKEN_PORT = 9810;

// ==================== Token 存储 ====================
interface TokenInfo {
  token: string;
  appId: string;
  createdAt: number;
  expireIn: number;
}

const tokenStore = new Map<string, TokenInfo>();
const appTokenMap = new Map<string, string>();

// ==================== 工具函数 ====================
function generateToken(): string {
  return `wb_${randomUUID().replace(/-/g, "")}_${Date.now()}`;
}

function createToken(appId: string): TokenInfo {
  const oldToken = appTokenMap.get(appId);
  if (oldToken) {
    tokenStore.delete(oldToken);
  }

  const tokenInfo: TokenInfo = {
    token: generateToken(),
    appId,
    createdAt: Date.now(),
    expireIn: TOKEN_EXPIRE_SECONDS,
  };

  tokenStore.set(tokenInfo.token, tokenInfo);
  appTokenMap.set(appId, tokenInfo.token);

  return tokenInfo;
}

function validateToken(token: string): TokenInfo | null {
  const info = tokenStore.get(token);
  if (!info) return null;

  const now = Date.now();
  const expireAt = info.createdAt + info.expireIn * 1000;

  if (now > expireAt) {
    tokenStore.delete(token);
    appTokenMap.delete(info.appId);
    return null;
  }

  return info;
}

function isTokenExpired(token: string): boolean {
  const info = tokenStore.get(token);
  if (!info) return true;

  const now = Date.now();
  const expireAt = info.createdAt + info.expireIn * 1000;
  return now > expireAt;
}

// ==================== HTTP Token API ====================
const tokenServer = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/open/auth/ws_token" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      console.log("\n📥 [Token API] 收到请求:");
      console.log("  Body:", body);

      try {
        const { app_id, app_secret } = JSON.parse(body);

        if (app_id !== VALID_APP_ID || app_secret !== VALID_APP_SECRET) {
          console.log("  ❌ 验证失败: 无效的 app_id 或 app_secret");
          res.writeHead(401);
          res.end(JSON.stringify({ error: "invalid_credentials", message: "Invalid app_id or app_secret" }));
          return;
        }

        const tokenInfo = createToken(app_id);

        console.log("  ✅ Token 创建成功:");
        console.log(`     Token: ${tokenInfo.token.substring(0, 30)}...`);
        console.log(`     过期时间: ${TOKEN_EXPIRE_SECONDS}秒`);

        res.writeHead(200);
        res.end(JSON.stringify({ code: 0, message: "success", data: { token: tokenInfo.token, expire_in: tokenInfo.expireIn } }));
      } catch (err) {
        console.log("  ❌ 请求解析失败:", err);
        res.writeHead(400);
        res.end(JSON.stringify({ error: "invalid_request", message: "Invalid JSON body" }));
      }
    });
    return;
  }

  if (req.url === "/token/status" && req.method === "GET") {
    const tokens = Array.from(tokenStore.entries()).map(([token, info]) => ({
      token: token.substring(0, 20) + "...",
      appId: info.appId,
      createdAt: new Date(info.createdAt).toISOString(),
      expireIn: info.expireIn,
      isExpired: isTokenExpired(token),
    }));

    res.writeHead(200);
    res.end(JSON.stringify({ tokens }, null, 2));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

tokenServer.listen(TOKEN_PORT, "0.0.0.0", () => {
  console.log(`🔑 Token Server: http://0.0.0.0:${TOKEN_PORT}`);
  console.log(`   - POST /open/auth/ws_token  获取/刷新 Token`);
  console.log(`   - GET  /token/status         查看 Token 状态`);
  console.log(`\n📋 写死的凭据:`);
  console.log(`   - app_id:     ${VALID_APP_ID}`);
  console.log(`   - app_secret: ${VALID_APP_SECRET}`);
});

// ==================== WebSocket Server ====================
interface ClientInfo {
  ws: WebSocket;
  appId: string;
  token: string;
  connectedAt: number;
  lastPingAt: number;
  messageCount: number;
}

const clients = new Map<WebSocket, ClientInfo>();
const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", "http://localhost");
  const appId = url.searchParams.get("app_id");
  const token = url.searchParams.get("token");

  console.log("\n🔌 [WebSocket] 新连接请求:");
  console.log("  - app_id:", appId);
  console.log("  - token:", token?.substring(0, 30) + "...");

  if (!appId || !token) {
    console.log("  ❌ 缺少参数");
    ws.close(4001, "Missing app_id or token");
    return;
  }

  const tokenInfo = validateToken(token);
  if (!tokenInfo) {
    console.log("  ❌ Token 无效或已过期");
    ws.close(4002, "Invalid or expired token");
    return;
  }

  if (tokenInfo.appId !== appId) {
    console.log("  ❌ app_id 不匹配");
    ws.close(4003, "App ID mismatch");
    return;
  }

  console.log("  ✅ 连接成功");

  const clientInfo: ClientInfo = {
    ws,
    appId,
    token,
    connectedAt: Date.now(),
    lastPingAt: Date.now(),
    messageCount: 0,
  };

  clients.set(ws, clientInfo);

  ws.send(JSON.stringify({
    type: "system",
    payload: {
      message: "Connected to Weibo Test Server",
      serverTime: new Date().toISOString(),
      tokenExpireIn: TOKEN_EXPIRE_SECONDS,
    },
  }));

  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "message",
        payload: {
          messageId: `msg_${Date.now()}`,
          fromUserId: "123456789",
          text: "你好！我是测试用户。Token 将在60秒后过期，测试客户端应该自动刷新。",
          timestamp: Date.now(),
        },
      }));
    }
  }, 1000);

  const testMessageInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      clientInfo.messageCount++;
      ws.send(JSON.stringify({
        type: "message",
        payload: {
          messageId: `msg_${Date.now()}`,
          fromUserId: "123456789",
          text: `测试消息 #${clientInfo.messageCount} - ${new Date().toLocaleTimeString()}`,
          timestamp: Date.now(),
        },
      }));
    }
  }, 10000);

  const tokenCheckInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      if (isTokenExpired(token)) {
        console.log(`  ⚠️ Token 过期，断开连接: ${appId}`);
        ws.close(4004, "Token expired");
      }
    }
  }, 5000);

  ws.on("message", (data) => {
    try {
      const text = data.toString();
      console.log(`\n📨 [WebSocket] 收到消息 (${appId}):`, text);

      if (text === "pong" || text.includes('"type":"pong"')) {
        clientInfo.lastPingAt = Date.now();
        return;
      }

      const msg = JSON.parse(text);

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (msg.type === "send_message") {
        console.log("  -> 发送消息请求:", msg.payload);
        ws.send(JSON.stringify({
          type: "system",
          payload: { message: "Message received", echo: msg.payload },
        }));
      }
    } catch (e) {
      console.error("  -> 消息解析失败:", e);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`\n🔌 [WebSocket] 连接断开 (${appId}):`);
    console.log(`  - Code: ${code}`);
    console.log(`  - Reason: ${reason.toString()}`);
    console.log(`  - 在线时长: ${(Date.now() - clientInfo.connectedAt) / 1000}秒`);
    console.log(`  - 消息数: ${clientInfo.messageCount}`);

    clearInterval(testMessageInterval);
    clearInterval(tokenCheckInterval);
    clients.delete(ws);
  });

  ws.on("error", (err) => {
    console.error(`\n❌ [WebSocket] 错误 (${appId}):`, err.message);
  });
});

console.log(`\n🚀 WebSocket Server: ws://0.0.0.0:${WS_PORT}`);

// ==================== 状态打印 ====================
setInterval(() => {
  if (clients.size > 0) {
    console.log(`\n📊 [状态] 在线客户端: ${clients.size}`);
    clients.forEach((info, ws) => {
      const duration = (Date.now() - info.connectedAt) / 1000;
      const tokenValid = !isTokenExpired(info.token);
      console.log(`   - ${info.appId}: ${duration.toFixed(0)}s, 消息:${info.messageCount}, Token:${tokenValid ? "有效" : "过期"}`);
    });
  }
}, 30000);

// ==================== 优雅退出 ====================
process.on("SIGINT", () => {
  console.log("\n\n🛑 正在关闭服务器...");

  clients.forEach((info) => {
    info.ws.close(1001, "Server shutting down");
  });

  wss.close(() => {
    console.log("✅ WebSocket Server 已关闭");
    tokenServer.close(() => {
      console.log("✅ Token Server 已关闭");
      process.exit(0);
    });
  });
});
