import { describe, expect, it } from "vitest";
import {
  buildSimInputItems,
  buildSimInboundPayload,
  getLatestCredentialFromState,
  getSimPageEndpoints,
  getSimUiUrl,
} from "../sim-page.js";

describe("getLatestCredentialFromState", () => {
  it("returns latest credential when state has credentials", () => {
    const result = getLatestCredentialFromState({
      credentials: [
        { appId: "old-app", appSecret: "old-secret", createdAt: 1 },
        { appId: "new-app", appSecret: "new-secret", createdAt: 2 },
      ],
    });

    expect(result).toEqual({ appId: "new-app", appSecret: "new-secret" });
  });

  it("returns null when state has no credential", () => {
    expect(getLatestCredentialFromState({ credentials: [] })).toBeNull();
    expect(getLatestCredentialFromState({})).toBeNull();
  });
});

describe("getSimPageEndpoints", () => {
  it("builds token and ws urls from page origin", () => {
    const result = getSimPageEndpoints({
      pageOrigin: "http://10.0.0.2:9810",
      wsPort: 9999,
    });

    expect(result.tokenUrl).toBe("http://10.0.0.2:9810/open/auth/ws_token");
    expect(result.wsUrl).toBe("ws://10.0.0.2:9999/ws/stream");
  });

  it("uses wss for https pages", () => {
    const result = getSimPageEndpoints({
      pageOrigin: "https://demo.example.com:9810",
      wsPort: 9999,
    });

    expect(result.wsUrl).toBe("wss://demo.example.com:9999/ws/stream");
  });
});

describe("getSimUiUrl", () => {
  it("builds a localhost ui url for the sim server", () => {
    expect(getSimUiUrl({ host: "127.0.0.1", httpPort: 9810 })).toBe("http://127.0.0.1:9810/");
  });
});

describe("buildSimInputItems", () => {
  it("builds a text-only responses-style input", () => {
    expect(buildSimInputItems({ text: "hello" })).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello" }],
      },
    ]);
  });

  it("builds an image-only responses-style input", () => {
    expect(buildSimInputItems({
      text: "",
      attachments: [
        {
          kind: "image",
          filename: "photo.png",
          mimeType: "image/png",
          dataBase64: "aGVsbG8=",
        },
      ],
    })).toEqual([
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_image",
            filename: "photo.png",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "aGVsbG8=",
            },
          },
        ],
      },
    ]);
  });

  it("builds a file-only responses-style input", () => {
    expect(buildSimInputItems({
      text: "",
      attachments: [
        {
          kind: "file",
          filename: "doc.txt",
          mimeType: "text/plain",
          dataBase64: "d29ybGQ=",
        },
      ],
    })).toEqual([
      {
        type: "message",
        role: "user",
        content: [
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
    ]);
  });
});

describe("buildSimInboundPayload", () => {
  it("keeps legacy text-only payloads when input is absent", () => {
    const result = buildSimInboundPayload({
      messageId: "msg_1",
      fromUserId: "123456",
      text: "hello",
      timestamp: 1,
    });

    expect(result).toEqual({
      messageId: "msg_1",
      fromUserId: "123456",
      text: "hello",
      timestamp: 1,
    });
  });

  it("includes responses-style input when provided", () => {
    const result = buildSimInboundPayload({
      messageId: "msg_2",
      fromUserId: "123456",
      text: "fallback",
      timestamp: 2,
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
          ],
        },
      ],
    });

    expect(result).toEqual({
      messageId: "msg_2",
      fromUserId: "123456",
      text: "fallback",
      timestamp: 2,
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
          ],
        },
      ],
    });
  });
});
