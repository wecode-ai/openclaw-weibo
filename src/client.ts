import WebSocket from "ws";
import type { ResolvedWeiboAccount } from "./types.js";
import { getValidToken, clearTokenCache } from "./token.js";

export type WebSocketMessageHandler = (data: unknown) => void;
export type WebSocketErrorHandler = (error: Error) => void;
export type WebSocketCloseHandler = (code: number, reason: string) => void;
export type WebSocketOpenHandler = () => void;

// Ping interval: 30 seconds
const PING_INTERVAL_MS = 30_000;
// Initial reconnect delay: 1 second
const INITIAL_RECONNECT_DELAY_MS = 1_000;
// Maximum reconnect delay: 60 seconds
const MAX_RECONNECT_DELAY_MS = 60_000;
// Maximum reconnect attempts (0 = infinite)
const MAX_RECONNECT_ATTEMPTS = 0;

export type WeiboClientOptions = {
  onMessage?: WebSocketMessageHandler;
  onError?: WebSocketErrorHandler;
  onClose?: WebSocketCloseHandler;
  onOpen?: WebSocketOpenHandler;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
};

export class WeiboWebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandler: WebSocketMessageHandler | null = null;
  private errorHandler: WebSocketErrorHandler | null = null;
  private closeHandler: WebSocketCloseHandler | null = null;
  private openHandler: WebSocketOpenHandler | null = null;

  // Heartbeat
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;
  private readonly PING_TIMEOUT_MS = 10_000;

  // Reconnection
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;

  constructor(
    private account: ResolvedWeiboAccount,
    private options: WeiboClientOptions = {}
  ) {
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS;
    this.messageHandler = options.onMessage ?? null;
    this.errorHandler = options.onError ?? null;
    this.closeHandler = options.onClose ?? null;
    this.openHandler = options.onOpen ?? null;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    const { wsEndpoint, appId, tokenEndpoint } = this.account;

    if (!wsEndpoint) {
      this.isConnecting = false;
      throw new Error(
        `WebSocket endpoint not configured for account "${this.account.accountId}"`
      );
    }

    if (!appId) {
      this.isConnecting = false;
      throw new Error(
        `App ID not configured for account "${this.account.accountId}"`
      );
    }

    try {
      // Fetch token from API
      const token = await getValidToken(this.account, tokenEndpoint);

      const url = new URL(wsEndpoint);
      url.searchParams.set("app_id", appId);
      url.searchParams.set("token", token);

      this.ws = new WebSocket(url.toString());

      this.ws.on("open", () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        this.startHeartbeat();
        this.openHandler?.();
      });

      this.ws.on("message", (data) => {
        try {
          const text = data.toString();

          // Handle pong response
          if (text === "pong" || text === "{\"type\":\"pong\"}") {
            this.lastPongTime = Date.now();
            return;
          }

          const parsed = JSON.parse(text);
          this.messageHandler?.(parsed);
        } catch {
          // Ignore invalid JSON
        }
      });

      this.ws.on("error", (err) => {
        this.errorHandler?.(err);
      });

      this.ws.on("close", (code, reason) => {
        this.isConnecting = false;
        this.stopHeartbeat();
        const reasonStr = reason.toString() || "unknown";
        this.closeHandler?.(code, reasonStr);

        // Auto reconnect if enabled
        if (this.shouldReconnect && this.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("pong", () => {
        this.lastPongTime = Date.now();
      });
    } catch (err) {
      this.isConnecting = false;
      // Schedule reconnect on connection failure
      if (this.shouldReconnect && this.autoReconnect) {
        this.scheduleReconnect();
      }
      throw err;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Check if we received pong recently
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > PING_INTERVAL_MS + this.PING_TIMEOUT_MS) {
          // Connection may be dead, close and reconnect
          console.warn(
            `weibo[${this.account.accountId}]: pong timeout, closing connection`
          );
          this.ws.terminate();
          return;
        }

        // Send ping
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch (err) {
          console.error(
            `weibo[${this.account.accountId}]: failed to send ping:`,
            err
          );
        }
      }
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    // Check max reconnect attempts
    if (
      this.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      console.error(
        `weibo[${this.account.accountId}]: max reconnect attempts reached`
      );
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );

    this.reconnectAttempts++;

    console.log(
      `weibo[${this.account.accountId}]: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch((err) => {
        console.error(
          `weibo[${this.account.accountId}]: reconnect failed:`,
          err
        );
      });
    }, delay);
  }

  onMessage(handler: WebSocketMessageHandler): void {
    this.messageHandler = handler;
  }

  onError(handler: WebSocketErrorHandler): void {
    this.errorHandler = handler;
  }

  onClose(handler: WebSocketCloseHandler): void {
    this.closeHandler = handler;
  }

  onOpen(handler: WebSocketOpenHandler): void {
    this.openHandler = handler;
  }

  send(data: unknown): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        return true;
      } catch (err) {
        console.error(
          `weibo[${this.account.accountId}]: failed to send message:`,
          err
        );
        return false;
      }
    }
    return false;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.ws?.close();
    this.ws = null;
  }
}

// Client cache for reusing connections
const clientCache = new Map<string, WeiboWebSocketClient>();

export function createWeiboClient(
  account: ResolvedWeiboAccount,
  options?: WeiboClientOptions
): WeiboWebSocketClient {
  const cached = clientCache.get(account.accountId);
  if (cached) {
    return cached;
  }
  const client = new WeiboWebSocketClient(account, options);
  clientCache.set(account.accountId, client);
  return client;
}

export function clearClientCache(accountId?: string): void {
  if (accountId) {
    const client = clientCache.get(accountId);
    if (client) {
      client.close();
      clientCache.delete(accountId);
    }
  } else {
    for (const client of clientCache.values()) {
      client.close();
    }
    clientCache.clear();
  }
}
