export function resolveWeiboAllowlistMatch({
  userId,
  allowFrom,
}: {
  userId: string;
  allowFrom: string[];
}): boolean {
  if (allowFrom.includes("*")) return true;
  return allowFrom.includes(userId);
}
