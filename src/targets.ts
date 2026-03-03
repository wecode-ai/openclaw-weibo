export function normalizeWeiboTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("user:")) return trimmed;
  return `user:${trimmed}`;
}

export function looksLikeWeiboId(str: string): boolean {
  return /^\d+$/.test(str.trim());
}

export function formatWeiboTarget(userId: string): string {
  return `user:${userId}`;
}
