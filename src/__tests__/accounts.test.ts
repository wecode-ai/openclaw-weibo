import { describe, it, expect } from "vitest";
import {
  resolveWeiboAccount,
  listWeiboAccountIds,
  resolveDefaultWeiboAccountId,
  listEnabledWeiboAccounts,
} from "../accounts.js";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

describe("resolveWeiboAccount", () => {
  it("returns default account from top-level config", () => {
    const cfg: ClawdbotConfig = {
      channels: {
        weibo: {
          enabled: true,
          appId: "test-app-id",
          appSecret: "test-token",
          wsEndpoint: "wss://example.com/ws",
        },
      },
    };
    const account = resolveWeiboAccount({ cfg, accountId: "default" });
    expect(account.accountId).toBe("default");
    expect(account.appId).toBe("test-app-id");
    expect(account.configured).toBe(true);
  });

  it("returns named account from accounts map", () => {
    const cfg: ClawdbotConfig = {
      channels: {
        weibo: {
          accounts: {
            account1: {
              enabled: true,
              appId: "app1",
              appSecret: "token1",
              wsEndpoint: "wss://ws1.example.com",
            },
          },
        },
      },
    };
    const account = resolveWeiboAccount({ cfg, accountId: "account1" });
    expect(account.accountId).toBe("account1");
    expect(account.appId).toBe("app1");
  });

  it("returns not configured for missing credentials", () => {
    const cfg: ClawdbotConfig = {
      channels: {
        weibo: {},
      },
    };
    const account = resolveWeiboAccount({ cfg, accountId: "default" });
    expect(account.configured).toBe(false);
  });

  it("treats numeric appId from config as string (config set stores numbers)", () => {
    const cfg = {
      channels: {
        weibo: {
          appId: 123456789 as unknown as string,
          appSecret: "test-secret",
        },
      },
    } as ClawdbotConfig;
    const account = resolveWeiboAccount({ cfg, accountId: "default" });
    expect(account.appId).toBe("123456789");
    expect(account.configured).toBe(true);
  });

  it("falls back to default endpoints when hot-reload leaves endpoint fields as empty strings", () => {
    const cfg: ClawdbotConfig = {
      channels: {
        weibo: {
          appId: "test-app-id",
          appSecret: "test-secret",
          wsEndpoint: "",
          tokenEndpoint: "",
        },
      },
    };

    const account = resolveWeiboAccount({ cfg, accountId: "default" });
    expect(account.wsEndpoint).toBe("ws://open-im.api.weibo.com/ws/stream");
    expect(account.tokenEndpoint).toBe("http://open-im.api.weibo.com/open/auth/ws_token");
    expect(account.config.wsEndpoint).toBe("ws://open-im.api.weibo.com/ws/stream");
    expect(account.config.tokenEndpoint).toBe("http://open-im.api.weibo.com/open/auth/ws_token");
  });

  it("defaults chunkMode to raw when config does not set it", () => {
    const cfg: ClawdbotConfig = {
      channels: {
        weibo: {
          appId: "test-app-id",
          appSecret: "test-secret",
        },
      },
    };

    const account = resolveWeiboAccount({ cfg, accountId: "default" });
    expect(account.config.chunkMode).toBe("raw");
  });
});

describe("listWeiboAccountIds", () => {
  it("returns default when only top-level config exists", () => {
    const cfg: ClawdbotConfig = {
      channels: {
        weibo: {
          appId: "test",
        },
      },
    };
    expect(listWeiboAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns all account ids including named ones", () => {
    const cfg: ClawdbotConfig = {
      channels: {
        weibo: {
          appId: "top",
          accounts: {
            account1: { enabled: true },
            account2: { enabled: false },
          },
        },
      },
    };
    expect(listWeiboAccountIds(cfg)).toEqual(["default", "account1", "account2"]);
  });
});
