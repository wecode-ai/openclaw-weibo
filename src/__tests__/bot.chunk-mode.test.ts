import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { handleWeiboMessage } from "../bot.js";

const sendMessageWeiboMock = vi.hoisted(() => vi.fn(async () => ({
  messageId: "send_result_1",
  chatId: "user:123456",
  chunkId: 0,
})));
const generateWeiboMessageIdMock = vi.hoisted(() => vi.fn(() => "outbound_group_1"));
const resolveWeiboAccountMock = vi.hoisted(() => vi.fn());
const getWeiboRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("../send.js", () => ({
  sendMessageWeibo: sendMessageWeiboMock,
  generateWeiboMessageId: generateWeiboMessageIdMock,
}));

vi.mock("../accounts.js", () => ({
  resolveWeiboAccount: resolveWeiboAccountMock,
}));

vi.mock("../runtime.js", () => ({
  getWeiboRuntime: getWeiboRuntimeMock,
}));

describe("handleWeiboMessage chunk mode", () => {
  const saveMediaBufferMock = vi.fn();

  beforeEach(() => {
    sendMessageWeiboMock.mockClear();
    generateWeiboMessageIdMock.mockClear();
    resolveWeiboAccountMock.mockReset();
    getWeiboRuntimeMock.mockReset();
    saveMediaBufferMock.mockReset();

    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "newline",
      },
    });

    getWeiboRuntimeMock.mockReturnValue({
      channel: {
        media: {
          saveMediaBuffer: saveMediaBufferMock,
        },
        routing: {
          resolveAgentRoute: () => ({
            agentId: "agent-1",
            sessionKey: "session-1",
            accountId: "default",
          }),
        },
        reply: {
          formatInboundEnvelope: ({ body }: { body?: string }) => body ?? "",
          finalizeInboundContext: (ctx: unknown) => ctx,
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: (reply: { text?: string }) => Promise<void> }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          dispatchReplyFromConfig: async ({ dispatcher }: { dispatcher: { deliver: (reply: { text?: string }) => Promise<void> } }) => {
            await dispatcher.deliver({ text: "第一段\n\n第二段" });
            return { queuedFinal: false, counts: { final: 1 } };
          },
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          // Intentionally opposite to account config: reproduces the mismatch bug path.
          resolveChunkMode: () => "length",
          chunkTextWithMode: (text: string, _limit: number, mode: "length" | "newline") =>
            mode === "newline" ? text.split(/\n[\t ]*\n+/g) : [text],
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });
  });

  it("uses account chunkMode=newline when sending chunked replies", async () => {
    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_1",
          fromUserId: "123456",
          text: "hello",
          timestamp: Date.now(),
        },
      },
      runtime: {
        log: () => undefined,
        error: () => undefined,
      } as never,
    });

    expect(sendMessageWeiboMock).toHaveBeenCalledTimes(2);
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: "第一段",
      messageId: "outbound_group_1",
      chunkId: 0,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "第二段",
      messageId: "outbound_group_1",
      chunkId: 1,
    }));
    expect(saveMediaBufferMock).not.toHaveBeenCalled();
  });
});
