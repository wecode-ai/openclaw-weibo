# 微博私信插件实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于飞书插件架构，开发一个仅支持 WebSocket 和文本私聊的微博私信通道插件。

**架构:** 复用飞书插件的 ChannelPlugin 接口和多账户设计，移除 Webhook、群组、媒体、工具等复杂功能，保留核心消息收发能力。

**Tech Stack:** TypeScript, ESM, Zod, ws (WebSocket client), OpenClaw Plugin SDK

**参考:** 设计文档 `docs/plans/2025-03-03-weibo-dm-plugin-design.md`

---

## 任务清单概览

1. 项目初始化 - package.json, tsconfig.json
2. 配置定义 - config-schema.ts, types.ts
3. 运行时 - runtime.ts
4. 账户管理 - accounts.ts
5. WebSocket 客户端 - client.ts
6. 消息发送 - send.ts
7. 目标格式处理 - targets.ts
8. 权限策略 - policy.ts
9. 消息处理器 - bot.ts
10. 事件监听 - monitor.ts
11. 出站适配器 - outbound.ts
12. ChannelPlugin - channel.ts
13. 插件入口 - index.ts
14. 单元测试

---

### Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1: 创建 package.json**

```json
{
  "name": "@yourname/openclaw-weibo",
  "version": "0.1.0",
  "type": "module",
  "description": "OpenClaw Weibo DM channel plugin",
  "scripts": {
    "test:unit": "vitest run",
    "ci:check": "npx tsc --noEmit && npm run test:unit"
  },
  "license": "MIT",
  "files": [
    "index.ts",
    "src/**/*.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.ts"
  ],
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "weibo",
      "label": "Weibo",
      "selectionLabel": "Weibo (微博)",
      "docsPath": "/channels/weibo",
      "docsLabel": "weibo",
      "blurb": "Weibo direct message channel.",
      "order": 80
    }
  },
  "dependencies": {
    "zod": "^4.3.6",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^25.0.10",
    "@types/ws": "^8.5.14",
    "@vitest/coverage-v8": "^2.1.8",
    "openclaw": "2026.3.1",
    "tsx": "^4.21.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  },
  "peerDependencies": {
    "openclaw": ">=2026.3.1"
  }
}
```

**Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["index.ts", "src/**/*"],
  "exclude": ["node_modules", "dist", "**/__tests__/**", "**/*.test.ts"]
}
```

**Step 3: 安装依赖**

```bash
npm install
```

**Step 4: Commit**

```bash
git add package.json tsconfig.json
git commit -m "chore: init weibo plugin project"
```

---

### Task 2: 配置定义

**Files:**
- Create: `src/config-schema.ts`
- Create: `src/types.ts`

**Step 1: 创建 src/config-schema.ts**

```typescript
import { z } from "zod";
export { z };

const DmPolicySchema = z.enum(["pairing"]);

export const WeiboAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    wsEndpoint: z.string().url().optional(),
    dmPolicy: DmPolicySchema.optional(),
    allowFrom: z.array(z.string()).optional(),
  })
  .strict();

export const WeiboConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    wsEndpoint: z.string().url().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.string()).optional(),
    accounts: z.record(z.string(), WeiboAccountConfigSchema.optional()).optional(),
  })
  .strict();
```

**Step 2: 创建 src/types.ts**

```typescript
import type { z } from "zod";
import type { WeiboConfigSchema, WeiboAccountConfigSchema } from "./config-schema.js";

export type WeiboConfig = z.infer<typeof WeiboConfigSchema>;
export type WeiboAccountConfig = z.infer<typeof WeiboAccountConfigSchema>;

export type ResolvedWeiboAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  appId?: string;
  appSecret?: string;
  wsEndpoint?: string;
  config: WeiboAccountConfig;
};

export type WeiboMessageContext = {
  messageId: string;
  senderId: string;
  text: string;
  createTime?: number;
};

export type WeiboSendResult = {
  messageId: string;
  chatId: string;
};
```

**Step 3: 运行类型检查**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/config-schema.ts src/types.ts
git commit -m "feat: add config schema and types"
```

---

### Task 3: 运行时 Holder

**Files:**
- Create: `src/runtime.ts`

**Step 1: 创建 src/runtime.ts**

```typescript
import type { RuntimeEnv } from "openclaw/plugin-sdk";

let weiboRuntime: RuntimeEnv | undefined;

export function setWeiboRuntime(runtime: RuntimeEnv): void {
  weiboRuntime = runtime;
}

export function getWeiboRuntime(): RuntimeEnv {
  if (!weiboRuntime) {
    return {
      log: console.log,
      error: console.error,
      channel: {
        text: {
          resolveMarkdownTableMode: () => "simple",
          convertMarkdownTables: (text: string) => text,
        },
      },
    } as RuntimeEnv;
  }
  return weiboRuntime;
}
```

**Step 2: Commit**

```bash
git add src/runtime.ts
git commit -m "feat: add runtime holder"
```

---

### Task 4: 账户管理

**Files:**
- Create: `src/accounts.ts`
- Test: `src/__tests__/accounts.test.ts`

**Step 1: 创建测试 src/__tests__/accounts.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import {
  resolveWeiboAccount,
  listWeiboAccountIds,
  resolveDefaultWeiboAccountId,
  listEnabledWeiboAccounts,
} from "../accounts.js";
import type { WeiboConfig } from "../types.js";

describe("resolveWeiboAccount", () => {
  it("returns default account from top-level config", () => {
    const cfg: WeiboConfig = {
      enabled: true,
      appId: "test-app-id",
      appSecret: "test-token",
      wsEndpoint: "wss://example.com/ws",
    };
    const account = resolveWeiboAccount({ cfg, accountId: "default" });
    expect(account.accountId).toBe("default");
    expect(account.appId).toBe("test-app-id");
    expect(account.configured).toBe(true);
  });

  it("returns named account from accounts map", () => {
    const cfg: WeiboConfig = {
      accounts: {
        account1: {
          enabled: true,
          appId: "app1",
          appSecret: "token1",
          wsEndpoint: "wss://ws1.example.com",
        },
      },
    };
    const account = resolveWeiboAccount({ cfg, accountId: "account1" });
    expect(account.accountId).toBe("account1");
    expect(account.appId).toBe("app1");
  });

  it("returns not configured for missing credentials", () => {
    const cfg: WeiboConfig = {};
    const account = resolveWeiboAccount({ cfg, accountId: "default" });
    expect(account.configured).toBe(false);
  });
});

describe("listWeiboAccountIds", () => {
  it("returns default when only top-level config exists", () => {
    const cfg: WeiboConfig = { appId: "test" };
    expect(listWeiboAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns all account ids including named ones", () => {
    const cfg: WeiboConfig = {
      appId: "top",
      accounts: {
        account1: { enabled: true },
        account2: { enabled: false },
      },
    };
    expect(listWeiboAccountIds(cfg)).toEqual(["default", "account1", "account2"]);
  });
});
```

**Step 2: 运行测试（应该失败）**

```bash
npm run test:unit -- src/__tests__/accounts.test.ts
```

**Step 3: 创建实现 src/accounts.ts**

```typescript
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import type { WeiboConfig, ResolvedWeiboAccount } from "./types.js";

const DEFAULT_ACCOUNT_ID = "default";

export function resolveWeiboAccount({
  cfg,
  accountId = DEFAULT_ACCOUNT_ID,
}: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): ResolvedWeiboAccount {
  const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;

  const isDefault = accountId === DEFAULT_ACCOUNT_ID;

  if (isDefault && weiboCfg) {
    const hasCredentials = !!(weiboCfg.appId && weiboCfg.appSecret);
    return {
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: weiboCfg.enabled ?? true,
      configured: hasCredentials,
      name: "Default",
      appId: weiboCfg.appId,
      appSecret: weiboCfg.appSecret,
      wsEndpoint: weiboCfg.wsEndpoint,
      config: {
        dmPolicy: weiboCfg.dmPolicy ?? "pairing",
        allowFrom: weiboCfg.allowFrom ?? [],
      },
    };
  }

  const accountCfg = weiboCfg?.accounts?.[accountId];
  const topLevel = {
    appId: weiboCfg?.appId,
    appSecret: weiboCfg?.appSecret,
    wsEndpoint: weiboCfg?.wsEndpoint,
    dmPolicy: weiboCfg?.dmPolicy,
    allowFrom: weiboCfg?.allowFrom,
  };

  const merged = {
    appId: accountCfg?.appId ?? topLevel.appId,
    appSecret: accountCfg?.appSecret ?? topLevel.appSecret,
    wsEndpoint: accountCfg?.wsEndpoint ?? topLevel.wsEndpoint,
    dmPolicy: accountCfg?.dmPolicy ?? topLevel.dmPolicy ?? "pairing",
    allowFrom: accountCfg?.allowFrom ?? topLevel.allowFrom ?? [],
  };

  const hasCredentials = !!(merged.appId && merged.appSecret);

  return {
    accountId,
    enabled: accountCfg?.enabled ?? weiboCfg?.enabled ?? true,
    configured: hasCredentials,
    name: accountCfg?.name,
    appId: merged.appId,
    appSecret: merged.appSecret,
    wsEndpoint: merged.wsEndpoint,
    config: {
      dmPolicy: merged.dmPolicy,
      allowFrom: merged.allowFrom,
    },
  };
}

export function listWeiboAccountIds(cfg: ClawdbotConfig): string[] {
  const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
  const accounts = weiboCfg?.accounts;
  const ids = [DEFAULT_ACCOUNT_ID];
  if (accounts) {
    ids.push(...Object.keys(accounts));
  }
  return ids;
}

export function resolveDefaultWeiboAccountId(cfg: ClawdbotConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function listEnabledWeiboAccounts(cfg: ClawdbotConfig): ResolvedWeiboAccount[] {
  const ids = listWeiboAccountIds(cfg);
  return ids
    .map((id) => resolveWeiboAccount({ cfg, accountId: id }))
    .filter((a) => a.enabled && a.configured);
}
```

**Step 4: 运行测试（应该通过）**

```bash
npm run test:unit -- src/__tests__/accounts.test.ts
```

**Step 5: Commit**

```bash
git add src/__tests__/accounts.test.ts src/accounts.ts
git commit -m "feat: add account management"
```

---

### Task 5: 目标格式处理

**Files:**
- Create: `src/targets.ts`
- Test: `src/__tests__/targets.test.ts`

**Step 1: 创建测试**

```typescript
import { describe, it, expect } from "vitest";
import { normalizeWeiboTarget, looksLikeWeiboId, formatWeiboTarget } from "../targets.js";

describe("normalizeWeiboTarget", () => {
  it("returns user:xxx format unchanged", () => {
    expect(normalizeWeiboTarget("user:123456")).toBe("user:123456");
  });

  it("prefixes plain id with user:", () => {
    expect(normalizeWeiboTarget("123456")).toBe("user:123456");
  });

  it("returns empty string for invalid input", () => {
    expect(normalizeWeiboTarget("")).toBe("");
    expect(normalizeWeiboTarget("   ")).toBe("");
  });
});

describe("looksLikeWeiboId", () => {
  it("returns true for numeric strings", () => {
    expect(looksLikeWeiboId("1234567890")).toBe(true);
  });

  it("returns false for non-numeric strings", () => {
    expect(looksLikeWeiboId("user:123")).toBe(false);
    expect(looksLikeWeiboId("abc")).toBe(false);
  });
});

describe("formatWeiboTarget", () => {
  it("returns user:xxx format", () => {
    expect(formatWeiboTarget("123456")).toBe("user:123456");
  });
});
```

**Step 2: 创建实现 src/targets.ts**

```typescript
export function normalizeWeiboTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("user:")) return trimmed;
  return `user:${trimmed}`;
}

export function looksLikeWeiboId(str: string): boolean {
  return /^\d+$/.test(str.trim());
}

export function formatWeiboTarget(userId: string): string {
  return `user:${userId}`;
}
```

**Step 3: 运行测试**

```bash
npm run test:unit -- src/__tests__/targets.test.ts
```

**Step 4: Commit**

```bash
git add src/__tests__/targets.test.ts src/targets.ts
git commit -m "feat: add target normalization"
```

---

### Task 6: WebSocket 客户端

**Files:**
- Create: `src/client.ts`

**Step 1: 创建 src/client.ts**

```typescript
import WebSocket from "ws";
import type { ResolvedWeiboAccount } from "./types.js";

export type WebSocketMessageHandler = (data: unknown) => void;
export type WebSocketErrorHandler = (error: Error) => void;
export type WebSocketCloseHandler = () => void;

export class WeiboWebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandler: WebSocketMessageHandler | null = null;
  private errorHandler: WebSocketErrorHandler | null = null;
  private closeHandler: WebSocketCloseHandler | null = null;

  constructor(private account: ResolvedWeiboAccount) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { wsEndpoint, appId, appSecret } = this.account;

      if (!wsEndpoint) {
        reject(new Error(`WebSocket endpoint not configured for account "${this.account.accountId}"`));
        return;
      }

      if (!appId || !appSecret) {
        reject(new Error(`Credentials not configured for account "${this.account.accountId}"`));
        return;
      }

      const url = new URL(wsEndpoint);
      url.searchParams.set("app_id", appId);
      url.searchParams.set("token", appSecret);

      this.ws = new WebSocket(url.toString());

      this.ws.on("open", () => {
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this.messageHandler?.(parsed);
        } catch {
          // Ignore invalid JSON
        }
      });

      this.ws.on("error", (err) => {
        this.errorHandler?.(err);
      });

      this.ws.on("close", () => {
        this.closeHandler?.();
      });
    });
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

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// Client cache for reusing connections
const clientCache = new Map<string, WeiboWebSocketClient>();

export function createWeiboClient(account: ResolvedWeiboAccount): WeiboWebSocketClient {
  const cached = clientCache.get(account.accountId);
  if (cached) {
    return cached;
  }
  const client = new WeiboWebSocketClient(account);
  clientCache.set(account.accountId, client);
  return client;
}

export function clearClientCache(accountId?: string): void {
  if (accountId) {
    clientCache.delete(accountId);
  } else {
    clientCache.clear();
  }
}
```

**Step 2: Commit**

```bash
git add src/client.ts
git commit -m "feat: add WebSocket client"
```

---

### Task 7: 消息发送

**Files:**
- Create: `src/send.ts`

**Step 1: 创建 src/send.ts**

```typescript
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import type { WeiboSendResult } from "./types.js";
import { resolveWeiboAccount } from "./accounts.js";
import { createWeiboClient } from "./client.js";
import { normalizeWeiboTarget } from "./targets.js";

export type SendWeiboMessageParams = {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  accountId?: string;
};

export async function sendMessageWeibo(params: SendWeiboMessageParams): Promise<WeiboSendResult> {
  const { cfg, to, text, accountId } = params;
  const account = resolveWeiboAccount({ cfg, accountId });

  if (!account.configured) {
    throw new Error(`Weibo account "${account.accountId}" not configured`);
  }

  const client = createWeiboClient(account);
  const receiveId = normalizeWeiboTarget(to);

  if (!receiveId) {
    throw new Error(`Invalid Weibo target: ${to}`);
  }

  const userId = receiveId.replace(/^user:/, "");

  client.send({
    type: "send_message",
    payload: {
      toUserId: userId,
      text: text ?? "",
    },
  });

  // Return mock result (actual messageId would come from server response)
  return {
    messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    chatId: receiveId,
  };
}
```

**Step 2: Commit**

```bash
git add src/send.ts
git commit -m "feat: add message sending"
```

---

### Task 8: 权限策略

**Files:**
- Create: `src/policy.ts`
- Test: `src/__tests__/policy.test.ts`

**Step 1: 创建测试**

```typescript
import { describe, it, expect } from "vitest";
import { resolveWeiboAllowlistMatch } from "../policy.js";

describe("resolveWeiboAllowlistMatch", () => {
  it("returns true when user is in allowFrom list", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "12345", allowFrom: ["12345", "67890"] })).toBe(true);
  });

  it("returns false when user is not in list", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "11111", allowFrom: ["12345", "67890"] })).toBe(false);
  });

  it("returns false for empty allowFrom", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "12345", allowFrom: [] })).toBe(false);
  });

  it("handles wildcard * in allowFrom", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "12345", allowFrom: ["*"] })).toBe(true);
  });
});
```

**Step 2: 创建实现 src/policy.ts**

```typescript
export function resolveWeiboAllowlistMatch({
  userId,
  allowFrom,
}: {
  userId: string;
  allowFrom: string[];
}): boolean {
  if (allowFrom.includes("*")) return true;
  return allowFrom.includes(userId);
}
```

**Step 3: 运行测试**

```bash
npm run test:unit -- src/__tests__/policy.test.ts
```

**Step 4: Commit**

```bash
git add src/__tests__/policy.test.ts src/policy.ts
git commit -m "feat: add allowlist policy"
```

---

### Task 9: 消息处理器

**Files:**
- Create: `src/bot.ts`

**Step 1: 创建 src/bot.ts**

```typescript
import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { WeiboMessageContext, ResolvedWeiboAccount } from "./types.js";
import { resolveWeiboAccount } from "./accounts.js";
import { resolveWeiboAllowlistMatch } from "./policy.js";
import { getWeiboRuntime } from "./runtime.js";
import { formatWeiboTarget } from "./targets.js";

// Simple in-memory dedup
const processedMessages = new Set<string>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(messageId: string): boolean {
  if (processedMessages.has(messageId)) {
    return true;
  }
  processedMessages.add(messageId);
  // Cleanup old entries periodically
  if (processedMessages.size > 1000) {
    const toDelete = Array.from(processedMessages).slice(0, 500);
    toDelete.forEach((id) => processedMessages.delete(id));
  }
  return false;
}

export type WeiboMessageEvent = {
  type: "message";
  payload: {
    messageId: string;
    fromUserId: string;
    text: string;
    timestamp?: number;
  };
};

export type HandleWeiboMessageParams = {
  cfg: ClawdbotConfig;
  event: WeiboMessageEvent;
  accountId: string;
  runtime?: RuntimeEnv;
};

export async function handleWeiboMessage(params: HandleWeiboMessageParams): Promise<void> {
  const { cfg, event, accountId, runtime } = params;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const account = resolveWeiboAccount({ cfg, accountId });
  if (!account.enabled || !account.configured) {
    error(`weibo[${accountId}]: account not enabled or configured`);
    return;
  }

  const { messageId, fromUserId, text, timestamp } = event.payload;

  // Deduplication
  if (isDuplicate(messageId)) {
    return;
  }

  // Check allowlist
  const isAllowed = resolveWeiboAllowlistMatch({
    userId: fromUserId,
    allowFrom: account.config.allowFrom ?? [],
  });

  if (!isAllowed) {
    log(`weibo[${accountId}]: message from ${fromUserId} not in allowlist, requesting pairing`);
    // Let OpenClaw handle pairing request
    // The framework will automatically send pairing request if user is not in allowlist
  }

  // Build message context
  const messageContext: WeiboMessageContext = {
    messageId,
    senderId: fromUserId,
    text: text ?? "",
    createTime: timestamp,
  };

  // Dispatch to OpenClaw runtime
  const rt = runtime ?? getWeiboRuntime();

  try {
    await rt.channel?.handleMessage?.({
      channel: "weibo",
      accountId,
      chatId: formatWeiboTarget(fromUserId),
      senderId: fromUserId,
      text: messageContext.text,
      messageId: messageContext.messageId,
      timestamp: messageContext.createTime,
    });
  } catch (err) {
    error(`weibo[${accountId}]: error dispatching message: ${String(err)}`);
  }
}
```

**Step 2: Commit**

```bash
git add src/bot.ts
git commit -m "feat: add message handler"
```

---

### Task 10: 事件监听/连接管理

**Files:**
- Create: `src/monitor.ts`

**Step 1: 创建 src/monitor.ts**

```typescript
import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedWeiboAccount } from "./types.js";
import { resolveWeiboAccount, listEnabledWeiboAccounts } from "./accounts.js";
import { createWeiboClient, WeiboWebSocketClient } from "./client.js";
import { handleWeiboMessage, type WeiboMessageEvent } from "./bot.js";

export type MonitorWeiboOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

// Track connections per account
const wsClients = new Map<string, WeiboWebSocketClient>();

async function monitorSingleAccount(params: {
  cfg: ClawdbotConfig;
  account: ResolvedWeiboAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { cfg, account, runtime, abortSignal } = params;
  const { accountId } = account;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  log(`weibo[${accountId}]: connecting WebSocket...`);

  const client = createWeiboClient(account);
  wsClients.set(accountId, client);

  client.onMessage((data) => {
    try {
      const msg = data as { type?: string; payload?: unknown };
      if (msg.type === "message" && msg.payload) {
        const event = msg as WeiboMessageEvent;
        handleWeiboMessage({ cfg, event, accountId, runtime }).catch((err) => {
          error(`weibo[${accountId}]: error handling message: ${String(err)}`);
        });
      }
    } catch (err) {
      error(`weibo[${accountId}]: error processing message: ${String(err)}`);
    }
  });

  client.onError((err) => {
    error(`weibo[${accountId}]: WebSocket error: ${err.message}`);
  });

  client.onClose(() => {
    log(`weibo[${accountId}]: WebSocket closed`);
    wsClients.delete(accountId);
  });

  // Handle abort signal
  const handleAbort = () => {
    log(`weibo[${accountId}]: abort signal received, closing connection`);
    client.close();
    wsClients.delete(accountId);
  };

  if (abortSignal?.aborted) {
    handleAbort();
    return;
  }

  abortSignal?.addEventListener("abort", handleAbort, { once: true });

  try {
    await client.connect();
    log(`weibo[${accountId}]: WebSocket connected`);
  } catch (err) {
    error(`weibo[${accountId}]: failed to connect: ${String(err)}`);
    wsClients.delete(accountId);
    throw err;
  }

  // Keep connection alive
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (abortSignal?.aborted || !wsClients.has(accountId)) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 1000);
  });
}

export async function monitorWeiboProvider(opts: MonitorWeiboOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("Config is required for Weibo monitor");
  }

  const log = opts.runtime?.log ?? console.log;

  // If accountId is specified, only monitor that account
  if (opts.accountId) {
    const account = resolveWeiboAccount({ cfg, accountId: opts.accountId });
    if (!account.enabled || !account.configured) {
      throw new Error(`Weibo account "${opts.accountId}" not configured or disabled`);
    }
    return monitorSingleAccount({ cfg, account, runtime: opts.runtime, abortSignal: opts.abortSignal });
  }

  // Otherwise, start all enabled accounts
  const accounts = listEnabledWeiboAccounts(cfg);
  if (accounts.length === 0) {
    throw new Error("No enabled Weibo accounts configured");
  }

  log(`weibo: starting ${accounts.length} account(s): ${accounts.map((a) => a.accountId).join(", ")}`);

  // Start all accounts in parallel
  await Promise.all(
    accounts.map((account) =>
      monitorSingleAccount({
        cfg,
        account,
        runtime: opts.runtime,
        abortSignal: opts.abortSignal,
      }),
    ),
  );
}

export function stopWeiboMonitor(accountId?: string): void {
  if (accountId) {
    const client = wsClients.get(accountId);
    if (client) {
      client.close();
      wsClients.delete(accountId);
    }
  } else {
    for (const client of wsClients.values()) {
      client.close();
    }
    wsClients.clear();
  }
}
```

**Step 2: Commit**

```bash
git add src/monitor.ts
git commit -m "feat: add WebSocket monitor"
```

---

### Task 11: 出站适配器

**Files:**
- Create: `src/outbound.ts`

**Step 1: 创建 src/outbound.ts**

```typescript
import type { ChannelOutboundAdapter, SendMessageParams, SendMediaParams } from "openclaw/plugin-sdk";
import type { ResolvedWeiboAccount } from "./types.js";
import { sendMessageWeibo } from "./send.js";

export const weiboOutbound: ChannelOutboundAdapter<ResolvedWeiboAccount> = {
  sendMessage: async (params: SendMessageParams<ResolvedWeiboAccount>) => {
    const { cfg, account, text, target, replyTo } = params;

    if (!account.configured) {
      throw new Error(`Weibo account "${account.accountId}" not configured`);
    }

    // Weibo doesn't support reply, ignore replyTo
    void replyTo;

    await sendMessageWeibo({
      cfg,
      to: target ?? "", // target should be user:xxx format
      text: text ?? "",
      accountId: account.accountId,
    });
  },

  sendMedia: async (_params: SendMediaParams<ResolvedWeiboAccount>) => {
    // Weibo plugin doesn't support media
    throw new Error("Weibo channel does not support media messages");
  },
};
```

**Step 2: Commit**

```bash
git add src/outbound.ts
git commit -m "feat: add outbound adapter"
```

---

### Task 12: ChannelPlugin 主实现

**Files:**
- Create: `src/channel.ts`

**Step 1: 创建 src/channel.ts**

```typescript
import type { ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId, PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk";
import type { ResolvedWeiboAccount, WeiboConfig } from "./types.js";
import {
  resolveWeiboAccount,
  listWeiboAccountIds,
  resolveDefaultWeiboAccountId,
} from "./accounts.js";
import { weiboOutbound } from "./outbound.js";
import { normalizeWeiboTarget, looksLikeWeiboId } from "./targets.js";
import { sendMessageWeibo } from "./send.js";

const meta = {
  id: "weibo",
  label: "Weibo",
  selectionLabel: "Weibo (微博)",
  docsPath: "/channels/weibo",
  docsLabel: "weibo",
  blurb: "Weibo direct message channel.",
  order: 80,
};

export const weiboPlugin: ChannelPlugin<ResolvedWeiboAccount> = {
  id: "weibo",
  meta,

  pairing: {
    idLabel: "weiboUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^user:/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      await sendMessageWeibo({
        cfg,
        to: id,
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  },

  capabilities: {
    chatTypes: ["direct"], // DM only
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: false,
  },

  agentPrompt: {
    messageToolHints: () => [
      "- Weibo targeting: omit `target` to reply to the current conversation. Explicit targets: `user:userId`.",
    ],
  },

  reload: { configPrefixes: ["channels.weibo"] },

  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        appId: { type: "string" },
        appSecret: { type: "string" },
        wsEndpoint: { type: "string", format: "uri" },
        dmPolicy: { type: "string", enum: ["pairing"] },
        allowFrom: { type: "array", items: { type: "string" } },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              name: { type: "string" },
              appId: { type: "string" },
              appSecret: { type: "string" },
              wsEndpoint: { type: "string" },
            },
          },
        },
      },
    },
  },

  config: {
    listAccountIds: (cfg) => listWeiboAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveWeiboAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultWeiboAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            weibo: {
              ...cfg.channels?.weibo,
              enabled,
            },
          },
        };
      }

      const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          weibo: {
            ...weiboCfg,
            accounts: {
              ...weiboCfg?.accounts,
              [accountId]: {
                ...weiboCfg?.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).weibo;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }

      const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
      const accounts = { ...weiboCfg?.accounts };
      delete accounts[accountId];

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          weibo: {
            ...weiboCfg,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appId: account.appId,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveWeiboAccount({ cfg, accountId });
      return (account.config?.allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean),
  },

  security: {
    collectWarnings: () => [],
  },

  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountConfig: ({ cfg, accountId }) => {
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            weibo: {
              ...cfg.channels?.weibo,
              enabled: true,
            },
          },
        };
      }

      const weiboCfg = cfg.channels?.weibo as WeiboConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          weibo: {
            ...weiboCfg,
            accounts: {
              ...weiboCfg?.accounts,
              [accountId]: {
                ...weiboCfg?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      };
    },
  },

  onboarding: {
    getSetupGuide: () => ({
      title: "Connect Weibo DM",
      steps: [
        {
          title: "Get Weibo API credentials",
          description: "Apply for Weibo Open Platform app and get App ID and Access Token.",
        },
        {
          title: "Configure WebSocket endpoint",
          description: "Set your WebSocket server endpoint URL.",
        },
        {
          title: "Set DM policy",
          description: "Configure pairing mode for user approval.",
        },
      ],
    }),
  },

  messaging: {
    normalizeTarget: normalizeWeiboTarget,
    targetResolver: {
      looksLikeId: looksLikeWeiboId,
      hint: "<userId>",
    },
  },

  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
    listPeersLive: async () => [],
    listGroupsLive: async () => [],
  },

  outbound: weiboOutbound,

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      port: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      port: snapshot.port ?? null,
    }),
    probeAccount: async () => ({ ok: true }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appId: account.appId,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      port: runtime?.port ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const { monitorWeiboProvider } = await import("./monitor.js");
      const account = resolveWeiboAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
      ctx.setStatus({ accountId: ctx.accountId, port: null });
      ctx.log?.info(`starting weibo[${ctx.accountId}] WebSocket`);
      return monitorWeiboProvider({
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
      });
    },
  },
};
```

**Step 2: Commit**

```bash
git add src/channel.ts
git commit -m "feat: add ChannelPlugin implementation"
```

---

### Task 13: 插件入口

**Files:**
- Create: `index.ts`

**Step 1: 创建 index.ts**

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { weiboPlugin } from "./src/channel.js";
import { setWeiboRuntime } from "./src/runtime.js";

export { monitorWeiboProvider } from "./src/monitor.js";
export { sendMessageWeibo } from "./src/send.js";
export { weiboPlugin } from "./src/channel.js";

const plugin = {
  id: "weibo",
  name: "Weibo",
  description: "Weibo DM channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setWeiboRuntime(api.runtime);
    api.registerChannel({ plugin: weiboPlugin });
  },
};

export default plugin;
```

**Step 2: 运行完整类型检查**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add index.ts
git commit -m "feat: add plugin entry point"
```

---

### Task 14: 运行完整测试

**Step 1: 运行所有测试**

```bash
npm run test:unit
```

**Step 2: 修复任何问题**

**Step 3: 最终提交**

```bash
git add .
git commit -m "test: add unit tests and finalize plugin"
```

---

## 总结

完成以上任务后，你将拥有一个完整的微博私信插件：

- ✅ WebSocket 连接
- ✅ 文本消息收发
- ✅ 配对模式
- ✅ 多账户支持
- ✅ 完整的类型定义
- ✅ 单元测试

**使用方法：**

```json
{
  "channels": {
    "weibo": {
      "enabled": true,
      "appId": "your-app-id",
      "appSecret": "your-access-token",
      "wsEndpoint": "wss://your-websocket-server.com/ws",
      "dmPolicy": "pairing",
      "allowFrom": []
    }
  }
}
```
