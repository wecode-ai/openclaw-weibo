import { describe, expect, it, vi } from "vitest";
import { buildAgentMediaPayloadCompat, waitUntilAbortCompat } from "../plugin-sdk-compat.js";

describe("plugin-sdk compatibility helpers", () => {
  it("falls back to local media payload builder when sdk helper is missing", () => {
    const payload = buildAgentMediaPayloadCompat(
      [
        { path: "/tmp/inbound/image.png", contentType: "image/png" },
        { path: "/tmp/inbound/doc.txt", contentType: "text/plain" },
      ],
      {},
    );

    expect(payload).toEqual({
      MediaPath: "/tmp/inbound/image.png",
      MediaPaths: ["/tmp/inbound/image.png", "/tmp/inbound/doc.txt"],
      MediaUrl: "/tmp/inbound/image.png",
      MediaUrls: ["/tmp/inbound/image.png", "/tmp/inbound/doc.txt"],
      MediaType: "image/png",
      MediaTypes: ["image/png", "text/plain"],
    });
  });

  it("delegates media payload building to sdk helper when available", () => {
    const buildAgentMediaPayload = vi.fn(() => ({ MediaPath: "/sdk/path" }));

    const payload = buildAgentMediaPayloadCompat(
      [{ path: "/tmp/inbound/image.png", contentType: "image/png" }],
      { buildAgentMediaPayload },
    );

    expect(buildAgentMediaPayload).toHaveBeenCalledWith([
      { path: "/tmp/inbound/image.png", contentType: "image/png" },
    ]);
    expect(payload).toEqual({ MediaPath: "/sdk/path" });
  });

  it("waits for abort when sdk wait helper is missing", async () => {
    const controller = new AbortController();
    let settled = false;

    const waiting = waitUntilAbortCompat(controller.signal, {}).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    controller.abort();
    await waiting;
    expect(settled).toBe(true);
  });

  it("delegates wait behavior to sdk helper when available", async () => {
    const waitUntilAbort = vi.fn(async () => undefined);

    await waitUntilAbortCompat(undefined, { waitUntilAbort });

    expect(waitUntilAbort).toHaveBeenCalledWith(undefined);
  });
});
