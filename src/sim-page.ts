type SimStateLike = {
  credentials?: Array<{
    appId?: unknown;
    appSecret?: unknown;
    createdAt?: unknown;
  }>;
};

export type LatestCredential = {
  appId: string;
  appSecret: string;
};

export function getLatestCredentialFromState(state: SimStateLike): LatestCredential | null {
  const credentials = Array.isArray(state.credentials) ? state.credentials : [];
  if (credentials.length === 0) {
    return null;
  }

  const sorted = [...credentials].sort((a, b) => {
    const aTs = typeof a.createdAt === "number" ? a.createdAt : 0;
    const bTs = typeof b.createdAt === "number" ? b.createdAt : 0;
    return bTs - aTs;
  });

  const first = sorted[0];
  const appId = String(first?.appId ?? "").trim();
  const appSecret = String(first?.appSecret ?? "").trim();

  if (!appId || !appSecret) {
    return null;
  }

  return { appId, appSecret };
}
