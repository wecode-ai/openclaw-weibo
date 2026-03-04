import http, { type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createSimStore, type SimLogLevel, type SimMessageRecord } from "./src/sim-store.js";

const HTTP_PORT = 9810;
const WS_PORT = 9999;
const TOKEN_EXPIRE_SECONDS = 3600;
const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 120_000;

const DEFAULT_APP_ID = "weibo_test_app";
const DEFAULT_APP_SECRET = "weibo_test_secret_key_123456";

type WsClient = {
  ws: WebSocket;
  appId: string;
  token: string;
  connectedAt: number;
  lastPongAt: number;
  lastPingAt: number;
  inboundCount: number;
  outboundCount: number;
};

const store = createSimStore();
store.registerCredentials(DEFAULT_APP_ID, DEFAULT_APP_SECRET);

const wsClients = new Map<WebSocket, WsClient>();
const sseClients = new Set<ServerResponse<IncomingMessage>>();

function nowIso(): string {
  return new Date().toISOString();
}

function sendJson(res: ServerResponse<IncomingMessage>, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Body too large"));
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function writeSse(res: ServerResponse<IncomingMessage>, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function log(level: SimLogLevel, message: string, details?: unknown): void {
  const entry = store.appendLog(level, message, details);

  if (level === "error") {
    console.error(`[${entry.timestamp}] ${message}`, details ?? "");
  } else if (level === "warn") {
    console.warn(`[${entry.timestamp}] ${message}`, details ?? "");
  } else {
    console.log(`[${entry.timestamp}] ${message}`, details ?? "");
  }

  for (const res of sseClients) {
    writeSse(res, "log", entry);
  }
}

function pushInboundToPlugin(appId: string, fromUserId: string, text: string): { delivered: number; message: SimMessageRecord } {
  const message = store.appendMessage({
    direction: "inbound",
    appId,
    fromUserId,
    text,
    timestamp: Date.now(),
  });

  let delivered = 0;

  for (const client of wsClients.values()) {
    if (client.appId !== appId) continue;
    if (client.ws.readyState !== WebSocket.OPEN) continue;

    client.ws.send(
      JSON.stringify({
        type: "message",
        payload: {
          messageId: message.id,
          fromUserId,
          text,
          timestamp: message.timestamp,
        },
      }),
    );

    client.inboundCount += 1;
    delivered += 1;
  }

  log("info", `inbound message queued to app ${appId}`, {
    fromUserId,
    delivered,
    messageId: message.id,
    text,
  });

  return { delivered, message };
}

function buildState() {
  const clients = Array.from(wsClients.values()).map((client) => ({
    appId: client.appId,
    tokenPrefix: `${client.token.slice(0, 18)}...`,
    connectedAt: client.connectedAt,
    connectedAtIso: new Date(client.connectedAt).toISOString(),
    lastPongAt: client.lastPongAt,
    lastPongAtIso: new Date(client.lastPongAt).toISOString(),
    secondsSincePong: Math.floor((Date.now() - client.lastPongAt) / 1000),
    inboundCount: client.inboundCount,
    outboundCount: client.outboundCount,
  }));

  return {
    serverTime: nowIso(),
    httpPort: HTTP_PORT,
    wsPort: WS_PORT,
    pongTimeoutMs: PONG_TIMEOUT_MS,
    tokenExpireSeconds: TOKEN_EXPIRE_SECONDS,
    credentials: store.listCredentials(),
    activeTokens: store.listTokens().map((token) => ({
      tokenPrefix: `${token.token.slice(0, 22)}...`,
      appId: token.appId,
      createdAt: token.createdAt,
      expireIn: token.expireIn,
      expiresAt: token.createdAt + token.expireIn * 1000,
    })),
    clients,
    counts: {
      clients: clients.length,
      messages: store.listMessages(10000).length,
      logs: store.listLogs(10000).length,
    },
  };
}

function listReceivedMessages(limit: number): SimMessageRecord[] {
  return store
    .listMessages(limit)
    .filter((item) => item.direction === "outbound")
    .sort((a, b) => b.timestamp - a.timestamp);
}

function renderPageHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Weibo Plugin Sim Server</title>
    <style>
      :root {
        --bg: #0f1a1d;
        --panel: #12262c;
        --panel-2: #173640;
        --text: #e9f4f7;
        --muted: #8cb1bb;
        --ok: #4bc293;
        --warn: #f1b64b;
        --err: #f36868;
        --line: #2a4e58;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background: radial-gradient(circle at top right, #1f4f5f, var(--bg));
        color: var(--text);
      }
      .wrap {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
      h1 { margin: 0 0 12px; }
      .hint { color: var(--muted); font-size: 13px; margin-bottom: 18px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 14px;
      }
      .card {
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 12px;
      }
      .card h2 { margin: 0 0 10px; font-size: 16px; }
      .row { display: flex; gap: 8px; margin-bottom: 8px; }
      input, textarea, button {
        width: 100%;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: #0f2026;
        color: var(--text);
      }
      textarea { min-height: 80px; resize: vertical; }
      button {
        cursor: pointer;
        background: #1b4c59;
        border-color: #2f6f80;
        font-weight: 600;
      }
      button:hover { background: #236173; }
      pre {
        margin: 0;
        padding: 10px;
        border-radius: 8px;
        background: #0d1a1f;
        border: 1px solid var(--line);
        color: #cfeef5;
        overflow: auto;
        max-height: 260px;
      }
      .mono {
        margin: 0;
        padding: 10px;
        border-radius: 8px;
        background: #0d1a1f;
        border: 1px solid var(--line);
        white-space: pre-wrap;
        word-break: break-word;
      }
      .logs { max-height: 320px; overflow: auto; }
      .log-line { border-bottom: 1px dashed #274650; padding: 6px 0; font-size: 12px; }
      .log-info { color: #a9dfef; }
      .log-warn { color: var(--warn); }
      .log-error { color: var(--err); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Weibo Plugin Sim Server</h1>
      <div class="hint">For local integration testing of token + websocket + message flow.</div>

      <div class="grid">
        <section class="card">
          <h2>Credentials</h2>
          <div class="row"><button id="genCredentialsBtn">Generate appId / appSecret</button></div>
          <pre id="credentialOutput">Waiting...</pre>
        </section>

        <section class="card">
          <h2>Token</h2>
          <div class="row"><input id="tokenAppId" placeholder="app_id" /></div>
          <div class="row"><input id="tokenAppSecret" placeholder="app_secret" /></div>
          <div class="row"><button id="genTokenBtn">Generate token</button></div>
          <pre id="tokenOutput">Waiting...</pre>
        </section>

        <section class="card">
          <h2>Send Message To Plugin (Inbound)</h2>
          <div class="row"><input id="inboundAppId" placeholder="app_id" /></div>
          <div class="row"><input id="inboundFrom" placeholder="from_user_id" value="123456789" /></div>
          <div class="row"><textarea id="inboundText" placeholder="message text"></textarea></div>
          <div class="row"><button id="sendInboundBtn">Send</button></div>
        </section>

        <section class="card">
          <h2>State</h2>
          <pre id="stateOutput">Loading...</pre>
        </section>

        <section class="card">
          <h2>Messages</h2>
          <pre id="messagesOutput">Loading...</pre>
        </section>

        <section class="card">
          <h2>Logs (Live)</h2>
          <div class="mono logs" id="logsOutput"></div>
        </section>
      </div>
    </div>

    <script>
      const credentialOutput = document.getElementById("credentialOutput");
      const tokenOutput = document.getElementById("tokenOutput");
      const stateOutput = document.getElementById("stateOutput");
      const messagesOutput = document.getElementById("messagesOutput");
      const logsOutput = document.getElementById("logsOutput");

      const tokenAppId = document.getElementById("tokenAppId");
      const tokenAppSecret = document.getElementById("tokenAppSecret");

      const inboundAppId = document.getElementById("inboundAppId");
      const inboundFrom = document.getElementById("inboundFrom");
      const inboundText = document.getElementById("inboundText");

      function fmt(obj) {
        return JSON.stringify(obj, null, 2);
      }

      function addLogLine(entry) {
        const div = document.createElement("div");
        div.className = "log-line log-" + (entry.level || "info");
        const stamp = new Date(entry.timestamp || Date.now()).toLocaleTimeString();
        div.textContent =
          "[" +
          stamp +
          "] [" +
          (entry.level || "info").toUpperCase() +
          "] " +
          entry.message;
        logsOutput.prepend(div);
        while (logsOutput.children.length > 200) {
          logsOutput.removeChild(logsOutput.lastChild);
        }
      }

      async function api(path, init) {
        const res = await fetch(path, {
          headers: { "Content-Type": "application/json" },
          ...init,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || JSON.stringify(data));
        }
        return data;
      }

      async function refreshState() {
        const data = await api("/api/state");
        stateOutput.textContent = fmt(data);
      }

      async function refreshMessages() {
        const data = await api("/api/messages?limit=50");
        messagesOutput.textContent = fmt(data);
      }

      async function refreshLogs() {
        const data = await api("/api/logs?limit=100");
        logsOutput.innerHTML = "";
        for (const entry of data.logs || []) {
          addLogLine(entry);
        }
      }

      document.getElementById("genCredentialsBtn").addEventListener("click", async () => {
        try {
          const data = await api("/api/auth/credentials", { method: "POST", body: "{}" });
          credentialOutput.textContent = fmt(data);
          tokenAppId.value = data.data.app_id;
          tokenAppSecret.value = data.data.app_secret;
          inboundAppId.value = data.data.app_id;
          await refreshState();
        } catch (err) {
          credentialOutput.textContent = String(err);
        }
      });

      document.getElementById("genTokenBtn").addEventListener("click", async () => {
        try {
          const data = await api("/open/auth/ws_token", {
            method: "POST",
            body: JSON.stringify({
              app_id: tokenAppId.value.trim(),
              app_secret: tokenAppSecret.value.trim(),
            }),
          });
          tokenOutput.textContent = fmt(data);
          await refreshState();
        } catch (err) {
          tokenOutput.textContent = String(err);
        }
      });

      document.getElementById("sendInboundBtn").addEventListener("click", async () => {
        try {
          await api("/api/messages/send", {
            method: "POST",
            body: JSON.stringify({
              app_id: inboundAppId.value.trim(),
              from_user_id: inboundFrom.value.trim(),
              text: inboundText.value,
            }),
          });
          inboundText.value = "";
          await refreshState();
          await refreshMessages();
        } catch (err) {
          addLogLine({ level: "error", message: String(err), timestamp: Date.now() });
        }
      });

      async function initialLoad() {
        await Promise.all([refreshState(), refreshMessages(), refreshLogs()]);
      }

      setInterval(() => {
        refreshState().catch(() => {});
      }, 3000);

      setInterval(() => {
        refreshMessages().catch(() => {});
      }, 4000);

      const stream = new EventSource("/api/logs/stream");
      stream.addEventListener("init", (event) => {
        const data = JSON.parse(event.data || "{}");
        logsOutput.innerHTML = "";
        for (const entry of data.logs || []) {
          addLogLine(entry);
        }
      });
      stream.addEventListener("log", (event) => {
        const entry = JSON.parse(event.data || "{}");
        addLogLine(entry);
      });
      stream.onerror = () => {
        addLogLine({ level: "warn", message: "log stream disconnected", timestamp: Date.now() });
      };

      initialLoad().catch((err) => {
        addLogLine({ level: "error", message: String(err), timestamp: Date.now() });
      });
    </script>
  </body>
</html>`;
}

const httpServer = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderPageHtml());
    return;
  }

  if (method === "POST" && path === "/api/auth/credentials") {
    const credentials = store.issueCredentials();
    log("info", "new credentials issued", { appId: credentials.appId });
    sendJson(res, 200, {
      code: 0,
      message: "success",
      data: {
        app_id: credentials.appId,
        app_secret: credentials.appSecret,
      },
    });
    return;
  }

  if (method === "POST" && path === "/open/auth/ws_token") {
    try {
      const body = await readJsonBody(req);
      const appId = String(body.app_id ?? "").trim();
      const appSecret = String(body.app_secret ?? "").trim();

      if (!appId || !appSecret) {
        sendJson(res, 400, { code: 4001, message: "app_id and app_secret are required" });
        return;
      }

      const tokenInfo = store.issueToken(appId, appSecret, TOKEN_EXPIRE_SECONDS);
      log("info", "token issued", { appId, tokenPrefix: `${tokenInfo.token.slice(0, 18)}...` });

      sendJson(res, 200, {
        code: 0,
        message: "success",
        data: {
          token: tokenInfo.token,
          expire_in: tokenInfo.expireIn,
        },
      });
    } catch (error) {
      const err = error as Error;
      const isAuthError = /invalid credentials/i.test(err.message);
      sendJson(res, isAuthError ? 401 : 400, {
        code: isAuthError ? 4002 : 4000,
        message: err.message,
      });
      log("warn", "token issuing failed", { message: err.message });
    }
    return;
  }

  if (method === "GET" && path === "/api/state") {
    sendJson(res, 200, buildState());
    return;
  }

  if (method === "GET" && path === "/api/messages") {
    const limit = Number(url.searchParams.get("limit") ?? "50");
    sendJson(res, 200, {
      messages: store.listMessages(Number.isFinite(limit) ? limit : 50),
    });
    return;
  }

  if (method === "GET" && (path === "/api/messages/receive" || path === "/api/ws/frames")) {
    const limit = Number(url.searchParams.get("limit") ?? "50");
    sendJson(res, 200, {
      messages: listReceivedMessages(Number.isFinite(limit) ? limit : 50),
    });
    return;
  }

  if (method === "POST" && (path === "/api/messages/send" || path === "/api/messages/inbound")) {
    try {
      const body = await readJsonBody(req);
      const appId = String(body.app_id ?? "").trim();
      const fromUserId = String(body.from_user_id ?? "").trim() || "123456789";
      const text = String(body.text ?? "").trim();

      if (!appId || !text) {
        sendJson(res, 400, { code: 4003, message: "app_id and text are required" });
        return;
      }

      const result = pushInboundToPlugin(appId, fromUserId, text);
      sendJson(res, 200, {
        code: 0,
        message: "success",
        data: {
          delivered: result.delivered,
          message_id: result.message.id,
        },
      });
    } catch (error) {
      const err = error as Error;
      sendJson(res, 400, { code: 4000, message: err.message });
      log("warn", "failed to send inbound message", { message: err.message });
    }
    return;
  }

  if (method === "GET" && path === "/api/logs") {
    const limit = Number(url.searchParams.get("limit") ?? "100");
    sendJson(res, 200, {
      logs: store.listLogs(Number.isFinite(limit) ? limit : 100),
    });
    return;
  }

  if (method === "GET" && path === "/api/logs/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    sseClients.add(res);
    writeSse(res, "init", { logs: store.listLogs(100) });

    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      res.end();
    });
    return;
  }

  sendJson(res, 404, { code: 4040, message: "Not found" });
});

const wsServer = new WebSocketServer({ port: WS_PORT });

function closeClient(client: WsClient, code: number, reason: string): void {
  if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) {
    client.ws.close(code, reason);
  }
}

wsServer.on("connection", (ws, request) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  const appId = url.searchParams.get("app_id") ?? "";
  const token = url.searchParams.get("token") ?? "";

  if (!(pathname === "/" || pathname === "/ws/stream")) {
    ws.close(4000, "Invalid path");
    return;
  }

  if (!appId || !token) {
    ws.close(4001, "Missing app_id or token");
    return;
  }

  const tokenInfo = store.validateToken(token);
  if (!tokenInfo || tokenInfo.appId !== appId) {
    ws.close(4002, "Invalid token");
    log("warn", "websocket auth failed", { appId, reason: "invalid token" });
    return;
  }

  const client: WsClient = {
    ws,
    appId,
    token,
    connectedAt: Date.now(),
    lastPongAt: Date.now(),
    lastPingAt: 0,
    inboundCount: 0,
    outboundCount: 0,
  };

  wsClients.set(ws, client);
  log("info", "websocket connected", { appId, remote: request.socket.remoteAddress });

  ws.send(
    JSON.stringify({
      type: "system",
      payload: {
        message: "connected to weibo sim server",
        serverTime: nowIso(),
        pongTimeoutMs: PONG_TIMEOUT_MS,
      },
    }),
  );

  const heartbeatInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const idleFor = Date.now() - client.lastPongAt;
    if (idleFor > PONG_TIMEOUT_MS) {
      log("warn", "closing websocket due to pong timeout", {
        appId,
        idleFor,
        timeoutMs: PONG_TIMEOUT_MS,
      });
      closeClient(client, 4005, "Pong timeout");
      return;
    }

    client.lastPingAt = Date.now();
    try {
      ws.ping();
      ws.send(JSON.stringify({ type: "ping" }));
    } catch (error) {
      log("warn", "failed to send heartbeat", {
        appId,
        message: (error as Error).message,
      });
      closeClient(client, 1011, "Heartbeat error");
    }
  }, HEARTBEAT_INTERVAL_MS);

  ws.on("pong", () => {
    client.lastPongAt = Date.now();
    log("info", "received websocket pong frame", { appId });
  });

  ws.on("message", (raw) => {
    try {
      const text = raw.toString();

      if (text === "pong") {
        client.lastPongAt = Date.now();
        return;
      }

      const parsed = JSON.parse(text) as {
        type?: string;
        payload?: {
          toUserId?: string;
          text?: string;
        };
      };

      if (parsed.type === "pong") {
        client.lastPongAt = Date.now();
        return;
      }

      if (parsed.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (parsed.type === "send_message") {
        const toUserId = String(parsed.payload?.toUserId ?? "").trim();
        const msgText = String(parsed.payload?.text ?? "");

        if (!toUserId) {
          ws.send(JSON.stringify({ type: "error", payload: { message: "toUserId is required" } }));
          return;
        }

        const record = store.appendMessage({
          direction: "outbound",
          appId,
          toUserId,
          text: msgText,
          timestamp: Date.now(),
          wsType: parsed.type,
          rawText: text,
          rawPayload: parsed,
        });

        client.outboundCount += 1;
        log("info", "received outbound message from plugin", {
          appId,
          messageId: record.id,
          toUserId,
          text: msgText,
          wsType: parsed.type,
          rawPayload: parsed,
        });

        ws.send(
          JSON.stringify({
            type: "ack",
            payload: {
              messageId: record.id,
              receivedAt: record.timestamp,
            },
          }),
        );
        return;
      }

      log("warn", "unknown websocket message type", { appId, payload: parsed });
    } catch (error) {
      log("warn", "failed to parse websocket message", {
        appId,
        message: (error as Error).message,
      });
    }
  });

  ws.on("close", (code, reason) => {
    clearInterval(heartbeatInterval);
    wsClients.delete(ws);
    log("info", "websocket closed", {
      appId,
      code,
      reason: reason.toString(),
      durationSec: Math.floor((Date.now() - client.connectedAt) / 1000),
      inboundCount: client.inboundCount,
      outboundCount: client.outboundCount,
    });
  });

  ws.on("error", (error) => {
    log("error", "websocket error", { appId, message: error.message });
  });
});

httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
  log("info", "http server started", {
    url: `http://0.0.0.0:${HTTP_PORT}`,
    endpoints: {
      credentials: "POST /api/auth/credentials",
      token: "POST /open/auth/ws_token",
      sendInbound: "POST /api/messages/send",
      messages: "GET /api/messages",
      logs: "GET /api/logs",
      logStream: "GET /api/logs/stream",
    },
  });
  log("info", "default credential ready", {
    appId: DEFAULT_APP_ID,
    appSecret: DEFAULT_APP_SECRET,
  });
});

log("info", "websocket server started", {
  wsRoot: `ws://0.0.0.0:${WS_PORT}`,
  wsStream: `ws://0.0.0.0:${WS_PORT}/ws/stream`,
});

process.on("SIGINT", () => {
  log("info", "shutting down server");

  for (const client of wsClients.values()) {
    closeClient(client, 1001, "Server shutting down");
  }

  wsServer.close(() => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
});
