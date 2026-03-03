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
