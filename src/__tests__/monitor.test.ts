import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { monitorWeiboProvider } from "../monitor.js";

const resolveWeiboAccountMock = vi.hoisted(() => vi.fn());
const listEnabledWeiboAccountsMock = vi.hoisted(() => vi.fn());
const createWeiboClientMock = vi.hoisted(() => vi.fn());
const handleWeiboMessageMock = vi.hoisted(() => vi.fn());

vi.mock("../accounts.js", () => ({
  resolveWeiboAccount: resolveWeiboAccountMock,
  listEnabledWeiboAccounts: listEnabledWeiboAccountsMock,
}));

vi.mock("../client.js", () => ({
  createWeiboClient: createWeiboClientMock,
}));

vi.mock("../bot.js", () => ({
  handleWeiboMessage: handleWeiboMessageMock,
}));

function makeRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
  } as unknown as RuntimeEnv;
}

function makeClient(options: {
  connectImpl?: (handlers: {
    open?: () => void;
    error?: (err: Error) => void;
    close?: (code: number, reason: string) => void;
  }) => Promise<void> | void;
} = {}) {
  let openHandler: (() => void) | undefined;
  let errorHandler: ((err: Error) => void) | undefined;
  let closeHandler: ((code: number, reason: string) => void) | undefined;

  return {
    onMessage: vi.fn(),
    onError: vi.fn((handler: (err: Error) => void) => {
      errorHandler = handler;
    }),
    onClose: vi.fn((handler: (code: number, reason: string) => void) => {
      closeHandler = handler;
    }),
    onOpen: vi.fn((handler: () => void) => {
      openHandler = handler;
    }),
    onStatus: vi.fn(),
    connect: vi.fn(async () => {
      await options.connectImpl?.({
        open: openHandler,
        error: errorHandler,
        close: closeHandler,
      });
    }),
    close: vi.fn(),
  };
}

describe("monitorWeiboProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const account = {
      accountId: "default",
      enabled: true,
      configured: true,
      appId: "app-1",
      appSecret: "secret-1",
      wsEndpoint: "ws://example.com/ws",
      tokenEndpoint: "https://example.com/token",
      config: {},
    };

    resolveWeiboAccountMock.mockReturnValue(account);
    listEnabledWeiboAccountsMock.mockReturnValue([account]);
  });

  it("publishes connecting and connected runtime state patches", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = makeClient({
      connectImpl: async ({ open }) => {
        open?.();
      },
    });
    createWeiboClientMock.mockReturnValue(client);

    const controller = new AbortController();
    const promise = monitorWeiboProvider({
      config: {} as OpenClawConfig,
      runtime: makeRuntime(),
      abortSignal: controller.signal,
      accountId: "default",
      statusSink: (patch: Record<string, unknown>) => patches.push(patch),
    } as never);

    await Promise.resolve();

    expect(patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ running: true, connected: false, connectionState: "connecting" }),
        expect.objectContaining({ running: true, connected: true, connectionState: "connected" }),
      ]),
    );

    controller.abort();
    await promise;
  });

  it("keeps the monitor pending and publishes error state when initial connect fails", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = makeClient({
      connectImpl: async ({ error }) => {
        const err = new Error("auth failed");
        error?.(err);
        throw err;
      },
    });
    createWeiboClientMock.mockReturnValue(client);

    const controller = new AbortController();
    const promise = monitorWeiboProvider({
      config: {} as OpenClawConfig,
      runtime: makeRuntime(),
      abortSignal: controller.signal,
      accountId: "default",
      statusSink: (patch: Record<string, unknown>) => patches.push(patch),
    } as never);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    expect(patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ running: true, connected: false, connectionState: "connecting" }),
        expect.objectContaining({ running: true, connected: false, connectionState: "error" }),
      ]),
    );

    controller.abort();
    await promise;
  });

  it("surfaces token fetch failures with a settings-friendly error message", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = makeClient({
      connectImpl: async ({ error }) => {
        const err = new Error("获取 token 失败: Failed to fetch token: 401 Unauthorized");
        error?.(err);
        throw err;
      },
    });
    createWeiboClientMock.mockReturnValue(client);

    const controller = new AbortController();
    const promise = monitorWeiboProvider({
      config: {} as OpenClawConfig,
      runtime: makeRuntime(),
      abortSignal: controller.signal,
      accountId: "default",
      statusSink: (patch: Record<string, unknown>) => patches.push(patch),
    } as never);

    await Promise.resolve();

    expect(patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          running: true,
          connected: false,
          connectionState: "error",
          lastError: expect.stringContaining("获取 token 失败"),
        }),
      ]),
    );

    controller.abort();
    await promise;
  });
});
