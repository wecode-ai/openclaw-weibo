import { describe, expect, it } from "vitest";
import { buildAgentMediaPayloadCompat, waitUntilAbortCompat } from "../plugin-sdk-compat.js";

describe("plugin-sdk compatibility helpers", () => {
  it("builds media payload from media list", () => {
    const payload = buildAgentMediaPayloadCompat(
      [
        { path: "/tmp/inbound/image.png", contentType: "image/png" },
        { path: "/tmp/inbound/doc.txt", contentType: "text/plain" },
      ],
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

  it("returns empty payload for empty media list", () => {
    const payload = buildAgentMediaPayloadCompat([]);
    expect(payload).toEqual({});
  });

  it("filters out invalid media items", () => {
    const payload = buildAgentMediaPayloadCompat([
      { path: "", contentType: "image/png" },
      { path: "/tmp/valid.png", contentType: "image/png" },
      { path: "   ", contentType: "text/plain" },
    ]);

    expect(payload).toEqual({
      MediaPath: "/tmp/valid.png",
      MediaPaths: ["/tmp/valid.png"],
      MediaUrl: "/tmp/valid.png",
      MediaUrls: ["/tmp/valid.png"],
      MediaType: "image/png",
      MediaTypes: ["image/png"],
    });
  });

  it("waits for abort signal", async () => {
    const controller = new AbortController();
    let settled = false;

    const waiting = waitUntilAbortCompat(controller.signal).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    controller.abort();
    await waiting;
    expect(settled).toBe(true);
  });

  it("resolves immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await waitUntilAbortCompat(controller.signal);
    // Should resolve without hanging
  });
});
