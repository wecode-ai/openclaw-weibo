import { describe, expect, it, vi } from "vitest";
import { createSimStore } from "../sim-store.js";

describe("sim-store", () => {
  it("issues credentials and token, then validates token", () => {
    const store = createSimStore();
    const { appId, appSecret } = store.issueCredentials();

    const tokenInfo = store.issueToken(appId, appSecret, 120);
    const validated = store.validateToken(tokenInfo.token);

    expect(tokenInfo.token).toMatch(/^wb_/);
    expect(validated?.appId).toBe(appId);
    expect(validated?.expireIn).toBe(120);
  });

  it("rejects token issuing with wrong credentials", () => {
    const store = createSimStore();
    const { appId } = store.issueCredentials();

    expect(() => store.issueToken(appId, "wrong-secret", 60)).toThrow(/invalid credentials/i);
  });

  it("expires token after ttl", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);

    const store = createSimStore();
    const { appId, appSecret } = store.issueCredentials();
    const tokenInfo = store.issueToken(appId, appSecret, 10);

    nowSpy.mockReturnValue(20_500);
    const validated = store.validateToken(tokenInfo.token);

    expect(validated).toBeNull();
    nowSpy.mockRestore();
  });

  it("stores inbound/outbound messages and returns latest first", () => {
    const store = createSimStore();

    store.appendMessage({
      direction: "inbound",
      appId: "app_1",
      fromUserId: "u_1",
      text: "hello",
      timestamp: 100,
    });

    store.appendMessage({
      direction: "outbound",
      appId: "app_1",
      toUserId: "u_1",
      text: "world",
      timestamp: 200,
    });

    const messages = store.listMessages(10);
    expect(messages).toHaveLength(2);
    expect(messages[0].direction).toBe("outbound");
    expect(messages[1].direction).toBe("inbound");
  });

  it("keeps raw websocket frame content for outbound records", () => {
    const store = createSimStore();

    const record = store.appendMessage({
      direction: "outbound",
      appId: "app_1",
      toUserId: "u_1",
      text: "hello",
      timestamp: 100,
      wsType: "send_message",
      rawText: "{\"type\":\"send_message\",\"payload\":{\"toUserId\":\"u_1\",\"text\":\"hello\"}}",
      rawPayload: {
        type: "send_message",
        payload: {
          toUserId: "u_1",
          text: "hello",
        },
      },
    });

    expect(record.wsType).toBe("send_message");
    expect(record.rawText).toContain("\"send_message\"");
    expect((record.rawPayload as { payload: { text: string } }).payload.text).toBe("hello");
  });

  it("keeps logs bounded by maxLogEntries", () => {
    const store = createSimStore({ maxLogEntries: 2 });

    store.appendLog("info", "line-1");
    store.appendLog("warn", "line-2");
    store.appendLog("error", "line-3");

    const logs = store.listLogs(10);
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe("line-3");
    expect(logs[1].message).toBe("line-2");
  });
});
