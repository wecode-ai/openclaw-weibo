import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { handleWeiboMessage } from "../bot.js";

const sendMessageWeiboMock = vi.hoisted(() => vi.fn(async () => ({
  messageId: "send_result_1",
  chatId: "user:123456",
  chunkId: 0,
  done: true,
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
  const dispatchReplyFromConfigMock = vi.fn();
  type DeliverInfo = { kind?: "block" | "final" };
  type DeliverFn = (reply: { text?: string }, info?: DeliverInfo) => Promise<void>;

  beforeEach(() => {
    sendMessageWeiboMock.mockClear();
    generateWeiboMessageIdMock.mockClear();
    resolveWeiboAccountMock.mockReset();
    getWeiboRuntimeMock.mockReset();
    saveMediaBufferMock.mockReset();
    dispatchReplyFromConfigMock.mockReset();

    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "newline",
        blockStreaming: true,
      },
    });

    dispatchReplyFromConfigMock.mockImplementation(async ({ dispatcher }: { dispatcher: { deliver: DeliverFn } }) => {
      await dispatcher.deliver({ text: "第一段\n\n第二段" });
      return { queuedFinal: false, counts: { final: 1 } };
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
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: DeliverFn }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          withReplyDispatcher: async (params: {
            run: () => Promise<unknown>;
            onSettled?: () => Promise<void> | void;
          }) => {
            try {
              return await params.run();
            } finally {
              await params.onSettled?.();
            }
          },
          dispatchReplyFromConfig: dispatchReplyFromConfigMock,
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          // Intentionally opposite to account config: reproduces the mismatch bug path.
          resolveChunkMode: () => "length",
          chunkTextWithMode: (text: string, _limit: number, mode: "length" | "newline" | "raw") =>
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
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "第二段",
      messageId: "outbound_group_1",
      chunkId: 1,
      done: true,
    }));
    expect(dispatchReplyFromConfigMock).toHaveBeenCalledWith(expect.objectContaining({
      replyOptions: expect.objectContaining({
        disableBlockStreaming: true,
      }),
    }));
    expect(saveMediaBufferMock).not.toHaveBeenCalled();
  });

  it("coalesces unexpected deliver blocks into final fallback when no partial stream exists", async () => {
    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "length",
        blockStreaming: true,
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
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: DeliverFn }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          withReplyDispatcher: async (params: {
            run: () => Promise<unknown>;
            onSettled?: () => Promise<void> | void;
          }) => {
            try {
              return await params.run();
            } finally {
              await params.onSettled?.();
            }
          },
          dispatchReplyFromConfig: async ({ dispatcher }: { dispatcher: { deliver: DeliverFn } }) => {
            await dispatcher.deliver({ text: "流式-1" }, { kind: "block" });
            await dispatcher.deliver({ text: "流式-2" }, { kind: "block" });
            await dispatcher.deliver({ text: "流式-3" }, { kind: "final" });
            return { queuedFinal: false, counts: { final: 1 } };
          },
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "length",
          chunkTextWithMode: (text: string) => [text],
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });

    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_2",
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

    expect(generateWeiboMessageIdMock).toHaveBeenCalledTimes(1);
    expect(sendMessageWeiboMock).toHaveBeenCalledTimes(1);
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: "流式-1流式-2流式-3",
      messageId: "outbound_group_1",
      chunkId: 0,
      done: true,
    }));
  });

  it("keeps newline chunking semantics when block streaming splits paragraph delimiters", async () => {
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
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: DeliverFn }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          withReplyDispatcher: async (params: {
            run: () => Promise<unknown>;
            onSettled?: () => Promise<void> | void;
          }) => {
            try {
              return await params.run();
            } finally {
              await params.onSettled?.();
            }
          },
          dispatchReplyFromConfig: async ({ dispatcher }: { dispatcher: { deliver: DeliverFn } }) => {
            await dispatcher.deliver({ text: "第一段\n" }, { kind: "block" });
            await dispatcher.deliver({ text: "\n第二段" }, { kind: "block" });
            await dispatcher.deliver({ text: "\n\n第三段" }, { kind: "final" });
            return { queuedFinal: false, counts: { final: 1 } };
          },
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "length",
          chunkTextWithMode: (text: string, _limit: number, mode: "length" | "newline" | "raw") =>
            mode === "newline" ? text.split(/\n[\t ]*\n+/g) : [text],
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });

    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_3",
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

    expect(sendMessageWeiboMock).toHaveBeenCalledTimes(3);
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: "第一段",
      messageId: "outbound_group_1",
      chunkId: 0,
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "第二段",
      messageId: "outbound_group_1",
      chunkId: 1,
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
      text: "第三段",
      messageId: "outbound_group_1",
      chunkId: 2,
      done: true,
    }));
  });

  it("allows disabling block streaming via account config", async () => {
    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "newline",
        blockStreaming: false,
      },
    });

    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_4",
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

    expect(dispatchReplyFromConfigMock).toHaveBeenCalledWith(expect.objectContaining({
      replyOptions: expect.objectContaining({
        disableBlockStreaming: true,
      }),
    }));
  });

  it("flushes buffered deliver text as done=true on settle when final payload is missing", async () => {
    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "length",
        blockStreaming: true,
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
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: DeliverFn }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          withReplyDispatcher: async (params: {
            run: () => Promise<unknown>;
            onSettled?: () => Promise<void> | void;
          }) => {
            try {
              return await params.run();
            } finally {
              await params.onSettled?.();
            }
          },
          dispatchReplyFromConfig: async ({ dispatcher }: { dispatcher: { deliver: DeliverFn } }) => {
            await dispatcher.deliver({ text: "最后一段" }, { kind: "block" });
            return { queuedFinal: false, counts: { final: 0 } };
          },
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "length",
          chunkTextWithMode: (text: string) => [text],
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });

    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_5",
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

    expect(sendMessageWeiboMock).toHaveBeenCalledTimes(1);
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: "最后一段",
      messageId: "outbound_group_1",
      chunkId: 0,
      done: true,
    }));
  });

  it("keeps raw fallback delivery unsplit when only deliver payloads are available", async () => {
    const chunkTextWithModeSpy = vi.fn((text: string) => [text]);
    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "raw",
        blockStreaming: true,
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
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: DeliverFn }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          withReplyDispatcher: async (params: {
            run: () => Promise<unknown>;
            onSettled?: () => Promise<void> | void;
          }) => {
            try {
              return await params.run();
            } finally {
              await params.onSettled?.();
            }
          },
          dispatchReplyFromConfig: async ({ dispatcher }: { dispatcher: { deliver: DeliverFn } }) => {
            await dispatcher.deliver({ text: "第一段\n\n第二段" }, { kind: "block" });
            await dispatcher.deliver({ text: "第三段" }, { kind: "final" });
            return { queuedFinal: false, counts: { final: 1 } };
          },
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "length",
          chunkTextWithMode: chunkTextWithModeSpy,
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });

    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_7",
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

    expect(chunkTextWithModeSpy).not.toHaveBeenCalled();
    expect(sendMessageWeiboMock).toHaveBeenCalledTimes(1);
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: "第一段\n\n第二段第三段",
      messageId: "outbound_group_1",
      chunkId: 0,
      done: true,
    }));
  });

  it("streams incremental chunks from onPartialReply and finalizes with a single done marker", async () => {
    const chunkTextWithModeSpy = vi.fn((text: string) => [text]);
    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "raw",
        blockStreaming: true,
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
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: DeliverFn }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          withReplyDispatcher: async (params: {
            run: () => Promise<unknown>;
            onSettled?: () => Promise<void> | void;
          }) => {
            try {
              return await params.run();
            } finally {
              await params.onSettled?.();
            }
          },
          dispatchReplyFromConfig: async (params: {
            dispatcher: { deliver: DeliverFn };
            replyOptions?: { onPartialReply?: (payload: { text?: string }) => void | Promise<void> };
          }) => {
            await params.replyOptions?.onPartialReply?.({ text: "a" });
            await params.replyOptions?.onPartialReply?.({ text: "ab" });
            await params.replyOptions?.onPartialReply?.({ text: "abc" });
            await params.dispatcher.deliver({ text: "abc" }, { kind: "final" });
            return { queuedFinal: false, counts: { final: 1 } };
          },
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "length",
          chunkTextWithMode: chunkTextWithModeSpy,
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });

    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_partial_1",
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

    expect(chunkTextWithModeSpy).not.toHaveBeenCalled();
    expect(sendMessageWeiboMock).toHaveBeenCalledTimes(4);
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: "a",
      messageId: "outbound_group_1",
      chunkId: 0,
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "b",
      messageId: "outbound_group_1",
      chunkId: 1,
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
      text: "c",
      messageId: "outbound_group_1",
      chunkId: 2,
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(4, expect.objectContaining({
      text: "",
      messageId: "outbound_group_1",
      chunkId: 3,
      done: true,
    }));
  });

  it("does not duplicate payloads already streamed by onPartialReply when deliver block/final arrives", async () => {
    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "raw",
        blockStreaming: true,
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
          createReplyDispatcherWithTyping: ({ deliver }: { deliver: DeliverFn }) => ({
            dispatcher: { deliver },
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          withReplyDispatcher: async (params: {
            run: () => Promise<unknown>;
            onSettled?: () => Promise<void> | void;
          }) => {
            try {
              return await params.run();
            } finally {
              await params.onSettled?.();
            }
          },
          dispatchReplyFromConfig: async (params: {
            dispatcher: { deliver: DeliverFn };
            replyOptions?: { onPartialReply?: (payload: { text?: string }) => void | Promise<void> };
          }) => {
            await params.replyOptions?.onPartialReply?.({ text: "a" });
            await params.replyOptions?.onPartialReply?.({ text: "ab" });
            await params.dispatcher.deliver({ text: "ab" }, { kind: "block" });
            await params.dispatcher.deliver({ text: "ab" }, { kind: "final" });
            return { queuedFinal: false, counts: { final: 1 } };
          },
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "length",
          chunkTextWithMode: (text: string) => [text],
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });

    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_partial_2",
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

    expect(sendMessageWeiboMock).toHaveBeenCalledTimes(3);
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: "a",
      messageId: "outbound_group_1",
      chunkId: 0,
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: "b",
      messageId: "outbound_group_1",
      chunkId: 1,
      done: false,
    }));
    expect(sendMessageWeiboMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
      text: "",
      messageId: "outbound_group_1",
      chunkId: 2,
      done: true,
    }));
  });

  it("logs elapsed time from inbound message receipt to first outbound chunk first character", async () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockReturnValueOnce(1000);
    dateNowSpy.mockReturnValueOnce(1188);
    const logMock = vi.fn();

    try {
      await handleWeiboMessage({
        cfg: {} as ClawdbotConfig,
        accountId: "default",
        event: {
          type: "message",
          payload: {
            messageId: "inbound_6",
            fromUserId: "123456",
            text: "hello",
            timestamp: 999,
          },
        },
        runtime: {
          log: logMock,
          error: () => undefined,
        } as never,
      });

      expect(logMock).toHaveBeenCalledWith("weibo[default]: first chunk first-char latency=188ms");
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});
