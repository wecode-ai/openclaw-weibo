import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTokenCache, fetchWeiboToken, getValidToken } from "../token.js";
import type { ResolvedWeiboAccount } from "../types.js";

function makeAccount(overrides: Partial<ResolvedWeiboAccount> = {}): ResolvedWeiboAccount {
  return {
    accountId: "acc-1",
    enabled: true,
    configured: true,
    appId: "app-1",
    appSecret: "secret-1",
    wsEndpoint: "ws://example.com/ws",
    tokenEndpoint: "https://example.com/token",
    config: {},
    ...overrides,
  } as ResolvedWeiboAccount;
}

describe("fetchWeiboToken", () => {
  afterEach(() => {
    clearTokenCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("serializes credentials as strings in request body", async () => {
    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          data: {
            token: "token-1",
            expire_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    vi.stubGlobal("fetch", mockFetch);

    const account = {
      accountId: "acc-1",
      enabled: true,
      configured: true,
      appId: 123,
      appSecret: 456,
    } as unknown as ResolvedWeiboAccount;

    await fetchWeiboToken(account, "https://example.com/token");

    const reqInit = mockFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(reqInit.body));

    expect(body.app_id).toBe("123");
    expect(body.app_secret).toBe("456");
  });

  it("does not reuse a cached token after credentials change for the same account", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { token: "token-1", expire_in: 3600 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { token: "token-2", expire_in: 3600 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const first = await getValidToken(makeAccount(), "https://example.com/token");
    const second = await getValidToken(
      makeAccount({ appSecret: "secret-2" }),
      "https://example.com/token",
    );

    expect(first).toBe("token-1");
    expect(second).toBe("token-2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a cached token after token endpoint changes for the same account", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { token: "token-1", expire_in: 3600 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { token: "token-2", expire_in: 3600 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const first = await getValidToken(makeAccount(), "https://example.com/token-a");
    const second = await getValidToken(makeAccount(), "https://example.com/token-b");

    expect(first).toBe("token-1");
    expect(second).toBe("token-2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries retryable token failures with exponential backoff", async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 500, statusText: "Server Error" }))
      .mockResolvedValueOnce(new Response("still failing", { status: 502, statusText: "Bad Gateway" }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { token: "token-3", expire_in: 3600 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWeiboToken(makeAccount(), "https://example.com/token");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ token: "token-3" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("stops after 3 total attempts when retryable token failures keep happening", async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("temporary failure", { status: 503, statusText: "Service Unavailable" }));

    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWeiboToken(makeAccount(), "https://example.com/token");
    const captured = promise.catch((err) => err);
    await vi.runAllTimersAsync();

    const err = await captured;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/503/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable auth failures", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("unauthorized", { status: 401, statusText: "Unauthorized" }));

    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchWeiboToken(makeAccount(), "https://example.com/token")).rejects.toThrow(/401/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the production default token endpoint when the configured endpoint is blank", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            token: "token-1",
            expire_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", mockFetch);

    await getValidToken(makeAccount({ tokenEndpoint: "" }), "");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://open-im.api.weibo.com/open/auth/ws_token",
      expect.any(Object),
    );
  });
});
