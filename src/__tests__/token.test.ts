import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTokenCache, fetchWeiboToken } from "../token.js";
import type { ResolvedWeiboAccount } from "../types.js";

describe("fetchWeiboToken", () => {
  afterEach(() => {
    clearTokenCache();
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
        { status: 200, headers: { "Content-Type": "application/json" } }
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
});
