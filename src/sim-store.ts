import { randomUUID } from "crypto";

export type SimLogLevel = "info" | "warn" | "error";

export type SimCredential = {
  appId: string;
  appSecret: string;
  createdAt: number;
};

export type SimTokenInfo = {
  token: string;
  appId: string;
  createdAt: number;
  expireIn: number;
};

export type SimMessageDirection = "inbound" | "outbound";

export type SimMessageRecord = {
  id: string;
  direction: SimMessageDirection;
  appId: string;
  fromUserId?: string;
  toUserId?: string;
  text: string;
  timestamp: number;
  wsType?: string;
  rawText?: string;
  rawPayload?: unknown;
};

export type SimLogRecord = {
  id: string;
  level: SimLogLevel;
  message: string;
  timestamp: number;
  details?: unknown;
};

type SimStoreOptions = {
  maxLogEntries?: number;
  maxMessageEntries?: number;
};

type AppendMessageInput = Omit<SimMessageRecord, "id"> & { id?: string };

const DEFAULT_MAX_LOG_ENTRIES = 300;
const DEFAULT_MAX_MESSAGE_ENTRIES = 500;

function randomSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function boundedPush<T>(arr: T[], value: T, max: number): void {
  arr.push(value);
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}

export function createSimStore(options: SimStoreOptions = {}) {
  const maxLogEntries = options.maxLogEntries ?? DEFAULT_MAX_LOG_ENTRIES;
  const maxMessageEntries = options.maxMessageEntries ?? DEFAULT_MAX_MESSAGE_ENTRIES;

  const credentialsByAppId = new Map<string, SimCredential>();
  const tokenByValue = new Map<string, SimTokenInfo>();
  const latestTokenByAppId = new Map<string, string>();
  const messages: SimMessageRecord[] = [];
  const logs: SimLogRecord[] = [];

  function issueCredentials(): SimCredential {
    const createdAt = Date.now();
    const credential = registerCredentials(
      `app_${createdAt}_${randomSuffix()}`,
      `secret_${randomSuffix()}`,
      createdAt,
    );
    return credential;
  }

  function registerCredentials(appId: string, appSecret: string, createdAt = Date.now()): SimCredential {
    const credential: SimCredential = {
      appId: String(appId),
      appSecret: String(appSecret),
      createdAt,
    };
    credentialsByAppId.set(credential.appId, credential);
    return credential;
  }

  function listCredentials(): SimCredential[] {
    return Array.from(credentialsByAppId.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  function issueToken(appId: string, appSecret: string, ttlSeconds: number): SimTokenInfo {
    const credential = credentialsByAppId.get(appId);
    if (!credential || credential.appSecret !== appSecret) {
      throw new Error("Invalid credentials");
    }

    const prior = latestTokenByAppId.get(appId);
    if (prior) {
      tokenByValue.delete(prior);
    }

    const tokenInfo: SimTokenInfo = {
      token: `wb_${randomSuffix()}_${Date.now()}`,
      appId,
      createdAt: Date.now(),
      expireIn: ttlSeconds,
    };

    tokenByValue.set(tokenInfo.token, tokenInfo);
    latestTokenByAppId.set(appId, tokenInfo.token);
    return tokenInfo;
  }

  function validateToken(token: string): SimTokenInfo | null {
    const tokenInfo = tokenByValue.get(token);
    if (!tokenInfo) {
      return null;
    }

    const expiresAt = tokenInfo.createdAt + tokenInfo.expireIn * 1000;
    if (Date.now() > expiresAt) {
      tokenByValue.delete(token);
      if (latestTokenByAppId.get(tokenInfo.appId) === token) {
        latestTokenByAppId.delete(tokenInfo.appId);
      }
      return null;
    }

    return tokenInfo;
  }

  function listTokens(): SimTokenInfo[] {
    return Array.from(tokenByValue.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  function appendMessage(message: AppendMessageInput): SimMessageRecord {
    const record: SimMessageRecord = {
      ...message,
      id: message.id ?? `msg_${Date.now()}_${randomSuffix()}`,
    };
    boundedPush(messages, record, maxMessageEntries);
    return record;
  }

  function listMessages(limit = 50): SimMessageRecord[] {
    if (limit <= 0) return [];
    return messages.slice(-limit).reverse();
  }

  function appendLog(level: SimLogLevel, message: string, details?: unknown): SimLogRecord {
    const record: SimLogRecord = {
      id: `log_${Date.now()}_${randomSuffix()}`,
      level,
      message,
      details,
      timestamp: Date.now(),
    };
    boundedPush(logs, record, maxLogEntries);
    return record;
  }

  function listLogs(limit = 200): SimLogRecord[] {
    if (limit <= 0) return [];
    return logs.slice(-limit).reverse();
  }

  return {
    registerCredentials,
    issueCredentials,
    listCredentials,
    issueToken,
    validateToken,
    listTokens,
    appendMessage,
    listMessages,
    appendLog,
    listLogs,
  };
}

export type SimStore = ReturnType<typeof createSimStore>;
