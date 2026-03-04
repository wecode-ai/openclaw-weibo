import type { WeiboResponseContentPart, WeiboResponseMessageInputItem } from "./types.js";

type SimStateLike = {
  credentials?: Array<{
    appId?: unknown;
    appSecret?: unknown;
    createdAt?: unknown;
  }>;
};

export type LatestCredential = {
  appId: string;
  appSecret: string;
};

export type SimPageEndpoints = {
  tokenUrl: string;
  wsUrl: string;
};

export type SimInboundPayload = {
  messageId: string;
  fromUserId: string;
  text: string;
  timestamp: number;
  input?: WeiboResponseMessageInputItem[];
};

export type SimComposerAttachment = {
  kind: "image" | "file";
  filename: string;
  mimeType: string;
  dataBase64: string;
};

export function getLatestCredentialFromState(state: SimStateLike): LatestCredential | null {
  const credentials = Array.isArray(state.credentials) ? state.credentials : [];
  if (credentials.length === 0) {
    return null;
  }

  const sorted = [...credentials].sort((a, b) => {
    const aTs = typeof a.createdAt === "number" ? a.createdAt : 0;
    const bTs = typeof b.createdAt === "number" ? b.createdAt : 0;
    return bTs - aTs;
  });

  const first = sorted[0];
  const appId = String(first?.appId ?? "").trim();
  const appSecret = String(first?.appSecret ?? "").trim();

  if (!appId || !appSecret) {
    return null;
  }

  return { appId, appSecret };
}

export function getSimPageEndpoints({
  pageOrigin,
  wsPort,
}: {
  pageOrigin: string;
  wsPort: number;
}): SimPageEndpoints {
  const origin = new URL(pageOrigin);
  const wsProtocol = origin.protocol === "https:" ? "wss:" : "ws:";
  const tokenUrl = new URL("/open/auth/ws_token", origin).toString();
  const wsUrl = `${wsProtocol}//${origin.hostname}:${wsPort}/ws/stream`;

  return {
    tokenUrl,
    wsUrl,
  };
}

export function getSimUiUrl({
  host,
  httpPort,
}: {
  host: string;
  httpPort: number;
}): string {
  return `http://${host}:${httpPort}/`;
}

export function buildSimInputItems(params: {
  text: string;
  attachments?: SimComposerAttachment[];
}): WeiboResponseMessageInputItem[] | undefined {
  const content: WeiboResponseContentPart[] = [];
  const text = params.text.trim();

  if (text) {
    content.push({
      type: "input_text",
      text,
    });
  }

  for (const attachment of params.attachments ?? []) {
    content.push({
      type: attachment.kind === "image" ? "input_image" : "input_file",
      filename: attachment.filename,
      source: {
        type: "base64",
        media_type: attachment.mimeType,
        data: attachment.dataBase64,
      },
    });
  }

  if (content.length === 0) {
    return undefined;
  }

  return [
    {
      type: "message",
      role: "user",
      content,
    },
  ];
}

export function buildSimInboundPayload(params: {
  messageId: string;
  fromUserId: string;
  text: string;
  timestamp: number;
  input?: WeiboResponseMessageInputItem[];
}): SimInboundPayload {
  return {
    messageId: params.messageId,
    fromUserId: params.fromUserId,
    text: params.text,
    timestamp: params.timestamp,
    ...(params.input?.length ? { input: params.input } : {}),
  };
}
