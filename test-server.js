// 简单的测试服务器，模拟微博 API
import { WebSocketServer } from "ws";
import http from "http";

// Token API 服务器
const tokenServer = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/open/auth/ws_token" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      console.log("[Token API] Received:", body);

      res.writeHead(200);
      res.end(JSON.stringify({
        data: {
          token: "test_token_" + Date.now(),
          expire_in: 7200
        }
      }));
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

tokenServer.listen(9810, "127.0.0.1", () => {
  console.log("[Token Server] http://127.0.0.1:9810/open/auth/ws_token");
});

// WebSocket 服务器
const wss = new WebSocketServer({ port: 9999 });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const appId = url.searchParams.get("app_id");
  const token = url.searchParams.get("token");

  console.log("[WebSocket] New connection:");
  console.log("  - app_id:", appId);
  console.log("  - token:", token?.substring(0, 20) + "...");

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: "message",
    payload: {
      messageId: "msg_" + Date.now(),
      fromUserId: "123456789",
      text: "Hello from test server!",
      timestamp: Date.now()
    }
  }));

  // 每 5 秒发送一条测试消息
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: "message",
        payload: {
          messageId: "msg_" + Date.now(),
          fromUserId: "123456789",
          text: "Test message at " + new Date().toLocaleTimeString(),
          timestamp: Date.now()
        }
      }));
    }
  }, 5000);

  // 处理收到的消息
  ws.on("message", (data) => {
    const text = data.toString();
    console.log("[WebSocket] Received:", text);

    // 响应 ping
    try {
      const msg = JSON.parse(text);
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        console.log("[WebSocket] Sent pong");
      }
      if (msg.type === "send_message") {
        console.log("[WebSocket] Send message request:", msg.payload);
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on("close", (code, reason) => {
    console.log("[WebSocket] Closed:", code, reason.toString());
    clearInterval(interval);
  });

  ws.on("error", (err) => {
    console.error("[WebSocket] Error:", err.message);
  });
});

console.log("[WebSocket Server] ws://localhost:9999");
console.log("\n测试配置:");
console.log(JSON.stringify({
  channels: {
    weibo: {
      enabled: true,
      appId: "test_app",
      appSecret: "test_secret",
      wsEndpoint: "ws://localhost:9999",
      tokenEndpoint: "http://127.0.0.1:9810/open/auth/ws_token",
      allowFrom: ["123456789"]
    }
  }
}, null, 2));
