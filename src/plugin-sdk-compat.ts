import * as pluginSdk from "openclaw/plugin-sdk";

export type MediaItem = {
  path: string;
  contentType?: string | null;
};

export type AgentMediaPayload = {
  MediaPath?: string;
  MediaPaths?: string[];
  MediaType?: string;
  MediaTypes?: string[];
  MediaUrl?: string;
  MediaUrls?: string[];
};

type PluginSdkCompat = {
  buildAgentMediaPayload?: (mediaList: MediaItem[]) => AgentMediaPayload;
  buildMediaPayload?: (mediaList: MediaItem[]) => AgentMediaPayload;
  waitUntilAbort?: (abortSignal?: AbortSignal) => Promise<void>;
};

function buildAgentMediaPayloadFallback(mediaList: MediaItem[]): AgentMediaPayload {
  const normalized = mediaList.filter((item) => typeof item.path === "string" && item.path.trim().length > 0);
  if (normalized.length === 0) {
    return {};
  }

  const paths = normalized.map((item) => item.path);
  const types = normalized.map((item) => item.contentType ?? undefined).filter((value): value is string => typeof value === "string");
  const payload: AgentMediaPayload = {
    MediaPath: paths[0],
    MediaPaths: paths,
    MediaUrl: paths[0],
    MediaUrls: paths,
  };

  if (types.length > 0) {
    payload.MediaType = types[0];
    payload.MediaTypes = types;
  }

  return payload;
}

function waitUntilAbortFallback(abortSignal?: AbortSignal): Promise<void> {
  if (!abortSignal) {
    return new Promise<void>(() => undefined);
  }
  if (abortSignal.aborted) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    abortSignal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export function buildAgentMediaPayloadCompat(
  mediaList: MediaItem[],
  sdk: PluginSdkCompat = pluginSdk as PluginSdkCompat,
): AgentMediaPayload {
  if (typeof sdk.buildAgentMediaPayload === "function") {
    return sdk.buildAgentMediaPayload(mediaList);
  }

  if (typeof sdk.buildMediaPayload === "function") {
    return sdk.buildMediaPayload(mediaList);
  }

  return buildAgentMediaPayloadFallback(mediaList);
}

export function waitUntilAbortCompat(
  abortSignal?: AbortSignal,
  sdk: PluginSdkCompat = pluginSdk as PluginSdkCompat,
): Promise<void> {
  if (typeof sdk.waitUntilAbort === "function") {
    return sdk.waitUntilAbort(abortSignal);
  }

  return waitUntilAbortFallback(abortSignal);
}
