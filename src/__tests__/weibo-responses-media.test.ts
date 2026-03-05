import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { handleWeiboMessage } from "../bot.js";

const resolveWeiboAccountMock = vi.hoisted(() => vi.fn());
const getWeiboRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("../accounts.js", () => ({
  resolveWeiboAccount: resolveWeiboAccountMock,
}));

vi.mock("../runtime.js", () => ({
  getWeiboRuntime: getWeiboRuntimeMock,
}));

describe("handleWeiboMessage media pipeline", () => {
  const saveMediaBufferMock = vi.fn();
  const finalizeInboundContextMock = vi.fn((ctx: unknown) => ctx);

  beforeEach(() => {
    resolveWeiboAccountMock.mockReset();
    getWeiboRuntimeMock.mockReset();
    saveMediaBufferMock.mockReset();
    finalizeInboundContextMock.mockReset();
    finalizeInboundContextMock.mockImplementation((ctx: unknown) => ctx);

    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {
        textChunkLimit: 4000,
        chunkMode: "newline",
      },
    });

    saveMediaBufferMock
      .mockResolvedValueOnce({
        path: "/tmp/inbound/image.png",
        contentType: "image/png",
      })
      .mockResolvedValueOnce({
        path: "/tmp/inbound/doc.txt",
        contentType: "text/plain",
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
          finalizeInboundContext: finalizeInboundContextMock,
          createReplyDispatcherWithTyping: () => ({
            dispatcher: {},
            replyOptions: {},
            markDispatchIdle: () => undefined,
          }),
          dispatchReplyFromConfig: async () => ({
            queuedFinal: false,
            counts: { final: 0 },
          }),
        },
        text: {
          resolveTextChunkLimit: () => 4000,
          resolveChunkMode: () => "newline",
          chunkTextWithMode: (text: string) => [text],
        },
      },
      system: {
        enqueueSystemEvent: () => undefined,
      },
    });
  });

  it("saves input_image and input_file parts and exposes media payload fields", async () => {
    await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_media_1",
          fromUserId: "123456",
          input: [
            {
              type: "message",
              role: "user",
              content: [
                { type: "input_text", text: "please inspect" },
                {
                  type: "input_image",
                  filename: "image.png",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: "aGVsbG8=",
                  },
                },
                {
                  type: "input_file",
                  filename: "doc.txt",
                  source: {
                    type: "base64",
                    media_type: "text/plain",
                    data: "d29ybGQ=",
                  },
                },
              ],
            },
          ],
        },
      },
      runtime: {
        log: () => undefined,
        error: () => undefined,
      } as never,
    });

    expect(saveMediaBufferMock).toHaveBeenCalledTimes(2);
    expect(saveMediaBufferMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      "image/png",
      "inbound",
      expect.any(Number),
      "image.png",
    );
    expect(saveMediaBufferMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Buffer),
      "text/plain",
      "inbound",
      expect.any(Number),
      "doc.txt",
    );

    expect(finalizeInboundContextMock).toHaveBeenCalledWith(expect.objectContaining({
      BodyForAgent: "please inspect",
      MediaPath: "/tmp/inbound/image.png",
      MediaType: "image/png",
      MediaUrl: "/tmp/inbound/image.png",
      MediaPaths: ["/tmp/inbound/image.png", "/tmp/inbound/doc.txt"],
      MediaUrls: ["/tmp/inbound/image.png", "/tmp/inbound/doc.txt"],
      MediaTypes: ["image/png", "text/plain"],
    }));
  });

  it("accepts image-only input without dropping the message", async () => {
    const result = await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "inbound_media_only_1",
          fromUserId: "123456",
          input: [
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_image",
                  filename: "image.png",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: "aGVsbG8=",
                  },
                },
              ],
            },
          ],
        },
      },
      runtime: {
        log: () => undefined,
        error: () => undefined,
      } as never,
    });

    expect(result).not.toBeNull();
    expect(saveMediaBufferMock).toHaveBeenCalledTimes(1);
    expect(finalizeInboundContextMock).toHaveBeenCalledWith(expect.objectContaining({
      BodyForAgent: "",
      MediaPath: "/tmp/inbound/image.png",
      MediaType: "image/png",
      MediaUrl: "/tmp/inbound/image.png",
      MediaPaths: ["/tmp/inbound/image.png"],
      MediaUrls: ["/tmp/inbound/image.png"],
      MediaTypes: ["image/png"],
    }));
  });

  it("derives a stable fallback id when inbound messageId is blank", async () => {
    const first = await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "",
          fromUserId: "123456",
          text: "first",
          timestamp: 1772633831991,
        },
      },
      runtime: {
        log: () => undefined,
        error: () => undefined,
      } as never,
    });

    const second = await handleWeiboMessage({
      cfg: {} as ClawdbotConfig,
      accountId: "default",
      event: {
        type: "message",
        payload: {
          messageId: "",
          fromUserId: "123456",
          text: "second",
          timestamp: 1772633832991,
        },
      },
      runtime: {
        log: () => undefined,
        error: () => undefined,
      } as never,
    });

    expect(first?.messageId).toBeTruthy();
    expect(second?.messageId).toBeTruthy();
    expect(first?.messageId).not.toBe(second?.messageId);
    expect(second).not.toBeNull();
  });
});
