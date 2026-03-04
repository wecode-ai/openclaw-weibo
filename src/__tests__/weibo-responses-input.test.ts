import { describe, expect, it } from "vitest";
import { normalizeWeiboInboundInput } from "../bot.js";
import type { WeiboMessageEvent } from "../bot.js";

function makeEvent(payload: WeiboMessageEvent["payload"]): WeiboMessageEvent {
  return {
    type: "message",
    payload,
  };
}

describe("normalizeWeiboInboundInput", () => {
  it("falls back to legacy payload.text when responses-style input is absent", () => {
    const normalized = normalizeWeiboInboundInput(
      makeEvent({
        messageId: "msg_1",
        fromUserId: "123456",
        text: "legacy text",
        timestamp: 1,
      }),
    );

    expect(normalized.text).toBe("legacy text");
    expect(normalized.images).toEqual([]);
    expect(normalized.files).toEqual([]);
  });

  it("prefers responses-style input_text over payload.text", () => {
    const normalized = normalizeWeiboInboundInput(
      makeEvent({
        messageId: "msg_2",
        fromUserId: "123456",
        text: "legacy text",
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "new text" }],
          },
        ],
      }),
    );

    expect(normalized.text).toBe("new text");
  });

  it("collects input_image and input_file parts from user messages", () => {
    const normalized = normalizeWeiboInboundInput(
      makeEvent({
        messageId: "msg_3",
        fromUserId: "123456",
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "look at this" },
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
      }),
    );

    expect(normalized.text).toBe("look at this");
    expect(normalized.images).toEqual([
      {
        base64: "aGVsbG8=",
        filename: "image.png",
        mimeType: "image/png",
      },
    ]);
    expect(normalized.files).toEqual([
      {
        base64: "d29ybGQ=",
        filename: "doc.txt",
        mimeType: "text/plain",
      },
    ]);
  });

  it("falls back to payload.text when responses-style input contains no text parts", () => {
    const normalized = normalizeWeiboInboundInput(
      makeEvent({
        messageId: "msg_4",
        fromUserId: "123456",
        text: "legacy fallback",
        input: [
          {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "aGVsbG8=",
                },
              },
            ],
          },
        ],
      }),
    );

    expect(normalized.text).toBe("legacy fallback");
  });

  it("ignores non-user messages and unsupported content parts", () => {
    const normalized = normalizeWeiboInboundInput(
      makeEvent({
        messageId: "msg_5",
        fromUserId: "123456",
        text: "legacy fallback",
        input: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "input_text", text: "ignore me" }],
          },
          {
            type: "message",
            role: "user",
            content: [{ type: "unknown_part" as "input_text", text: "skip" }],
          },
        ],
      }),
    );

    expect(normalized.text).toBe("legacy fallback");
    expect(normalized.images).toEqual([]);
    expect(normalized.files).toEqual([]);
  });
});
