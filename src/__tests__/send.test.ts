import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { sendMessageWeibo } from "../send.js";

const sendMock = vi.hoisted(() => vi.fn());
const resolveWeiboAccountMock = vi.hoisted(() => vi.fn());
const createWeiboClientMock = vi.hoisted(() => vi.fn());
const normalizeWeiboTargetMock = vi.hoisted(() => vi.fn());

vi.mock("../accounts.js", () => ({
  resolveWeiboAccount: resolveWeiboAccountMock,
}));

vi.mock("../client.js", () => ({
  createWeiboClient: createWeiboClientMock,
}));

vi.mock("../targets.js", () => ({
  normalizeWeiboTarget: normalizeWeiboTargetMock,
}));

describe("sendMessageWeibo", () => {
  beforeEach(() => {
    sendMock.mockReset();
    resolveWeiboAccountMock.mockReset();
    createWeiboClientMock.mockReset();
    normalizeWeiboTargetMock.mockReset();

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
      cfg: {} as ClawdbotConfig,
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
      cfg: {} as ClawdbotConfig,
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
