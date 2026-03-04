export type SyncCommand = string[];

export type SyncGithubMainToGiteeOptions = {
  dryRun?: boolean;
  now?: Date;
  ensureRemote: (remote: string) => void;
  runCommand: (command: SyncCommand) => void;
  write: (message: string) => void;
};

export function buildSyncBranchName(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `sync/from-github-main-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function buildSyncPlan(input: { branchName: string }): string[][] {
  return [
    ["git", "fetch", "origin"],
    ["git", "fetch", "gitee"],
    ["git", "show-ref", "--verify", "--quiet", "refs/remotes/origin/main"],
    ["git", "branch", input.branchName, "origin/main"],
    ["git", "push", "gitee", `${input.branchName}:${input.branchName}`],
  ];
}

export function formatSuccessMessage(branchName: string): string {
  return [
    `Pushed sync branch: ${branchName}`,
    "Create a Gitee MR",
    `source branch: ${branchName}`,
    "target branch: main",
    "Resolve conflicts in Gitee if needed.",
  ].join("\n");
}

export function formatDryRunMessage(branchName: string, plan: SyncCommand[]): string {
  return [
    `Planned sync branch: ${branchName}`,
    "Planned commands:",
    ...plan.map((command) => command.join(" ")),
  ].join("\n");
}

export function syncGithubMainToGitee(options: SyncGithubMainToGiteeOptions): string {
  const branchName = buildSyncBranchName(options.now ?? new Date());
  const plan = buildSyncPlan({ branchName });

  options.ensureRemote("origin");
  options.ensureRemote("gitee");

  if (options.dryRun) {
    options.write(formatDryRunMessage(branchName, plan));
    return branchName;
  }

  for (const command of plan) {
    options.runCommand(command);
  }

  options.write(formatSuccessMessage(branchName));
  return branchName;
}
