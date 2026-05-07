import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendMessageWeibo, sendFileDmWeibo } from "../send.js";

const sendMock = vi.hoisted(() => vi.fn());
const resolveWeiboAccountMock = vi.hoisted(() => vi.fn());
const createWeiboClientMock = vi.hoisted(() => vi.fn());
const normalizeWeiboTargetMock = vi.hoisted(() => vi.fn());
const getValidTokenMock = vi.hoisted(() => vi.fn());
const getWeiboApiBaseUrlMock = vi.hoisted(() => vi.fn());

vi.mock("../accounts.js", () => ({
  resolveWeiboAccount: resolveWeiboAccountMock,
}));

vi.mock("../client.js", () => ({
  createWeiboClient: createWeiboClientMock,
}));

vi.mock("../targets.js", () => ({
  normalizeWeiboTarget: normalizeWeiboTargetMock,
}));

vi.mock("../token.js", () => ({
  getValidToken: getValidTokenMock,
  getWeiboApiBaseUrl: getWeiboApiBaseUrlMock,
}));

describe("sendMessageWeibo", () => {
  beforeEach(() => {
    sendMock.mockReset();
    resolveWeiboAccountMock.mockReset();
    createWeiboClientMock.mockReset();
    normalizeWeiboTargetMock.mockReset();
    getValidTokenMock.mockReset();
    getWeiboApiBaseUrlMock.mockReset();

    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      config: {},
    });
    createWeiboClientMock.mockReturnValue({
      send: sendMock,
    });
    normalizeWeiboTargetMock.mockReturnValue("user:123456");
  });

  it("sends messageId and chunkId when provided", async () => {
    await sendMessageWeibo({
      cfg: {} as OpenClawConfig,
      to: "123456",
      text: "Reply",
      accountId: "default",
      messageId: "msg_group_1",
      chunkId: 2,
      done: false,
    });

    expect(sendMock).toHaveBeenCalledWith({
      type: "send_message",
      payload: {
        toUserId: "123456",
        text: "Reply",
        messageId: "msg_group_1",
        chunkId: 2,
        done: false,
      },
    });
  });

  it("defaults chunkId to 0, done=true and returns same generated messageId", async () => {
    const result = await sendMessageWeibo({
      cfg: {} as OpenClawConfig,
      to: "123456",
      text: "Reply",
      accountId: "default",
    });

    const sent = sendMock.mock.calls[0]?.[0] as {
      payload?: { messageId?: string; chunkId?: number; done?: boolean };
    };

    expect(sent.payload?.messageId).toMatch(/^msg_/);
    expect(sent.payload?.chunkId).toBe(0);
    expect(sent.payload?.done).toBe(true);
    expect(result.messageId).toBe(sent.payload?.messageId);
    expect(result.chunkId).toBe(0);
    expect(result.done).toBe(true);
  });
});

describe("sendFileDmWeibo", () => {
  const cfg = {} as OpenClawConfig;
  const fileBuffer = Buffer.from("fake-image-data");

  beforeEach(() => {
    resolveWeiboAccountMock.mockReset();
    normalizeWeiboTargetMock.mockReset();
    getValidTokenMock.mockReset();
    getWeiboApiBaseUrlMock.mockReset();

    resolveWeiboAccountMock.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      tokenEndpoint: "https://open-im.api.weibo.com/open/auth/ws_token",
      config: {},
    });
    normalizeWeiboTargetMock.mockReturnValue("user:123456");
    getValidTokenMock.mockResolvedValue("test-token-abc");
    getWeiboApiBaseUrlMock.mockReturnValue("https://open-im.api.weibo.com");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("constructs the correct URL with token and fileName query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, data: { fid: 42, message_id: "mid-1" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    await sendFileDmWeibo({ cfg, to: "123456", buffer: fileBuffer, fileName: "photo.jpg" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/open/dm/send_file");
    expect(calledUrl).toContain("token=test-token-abc");
    expect(calledUrl).toContain("fileName=photo.jpg");
  });

  it("returns messageId, chatId and fid on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, data: { fid: 99, message_id: "mid-success" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await sendFileDmWeibo({ cfg, to: "123456", buffer: fileBuffer, fileName: "img.png" });

    expect(result.messageId).toBe("mid-success");
    expect(result.chatId).toBe("user:123456");
    expect(result.fid).toBe(99);
  });

  it("throws on non-200 HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })),
    );

    await expect(
      sendFileDmWeibo({ cfg, to: "123456", buffer: fileBuffer, fileName: "img.png" }),
    ).rejects.toThrow(/500/);
  });

  it("throws on non-zero API code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 40001, message: "invalid token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      sendFileDmWeibo({ cfg, to: "123456", buffer: fileBuffer, fileName: "img.png" }),
    ).rejects.toThrow(/40001/);
  });

  it("throws when code=0 but message_id is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, data: { fid: 1 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      sendFileDmWeibo({ cfg, to: "123456", buffer: fileBuffer, fileName: "img.png" }),
    ).rejects.toThrow(/omitted required data\.message_id or data\.fid/);
  });

  it("throws when code=0 but fid is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 0, data: { message_id: "mid-x" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      sendFileDmWeibo({ cfg, to: "123456", buffer: fileBuffer, fileName: "img.png" }),
    ).rejects.toThrow(/omitted required data\.message_id or data\.fid/);
  });
});
