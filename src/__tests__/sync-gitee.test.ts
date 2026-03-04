import { describe, expect, it } from "vitest";
import {
  buildSyncBranchName,
  buildSyncPlan,
  formatSuccessMessage,
  formatDryRunMessage,
  syncGithubMainToGitee,
} from "../sync-gitee.js";

describe("buildSyncBranchName", () => {
  it("creates a unique branch name with the expected prefix", () => {
    const result = buildSyncBranchName(new Date("2026-03-04T21:35:00Z"));
    expect(result).toBe("sync/from-github-main-20260304-213500");
  });
});

describe("buildSyncPlan", () => {
  it("builds the fetch, branch creation, and push steps from origin/main", () => {
    const plan = buildSyncPlan({
      branchName: "sync/from-github-main-20260304-213500",
    });

    expect(plan).toEqual([
      ["git", "fetch", "origin"],
      ["git", "fetch", "gitee"],
      ["git", "show-ref", "--verify", "--quiet", "refs/remotes/origin/main"],
      ["git", "branch", "sync/from-github-main-20260304-213500", "origin/main"],
      [
        "git",
        "push",
        "gitee",
        "sync/from-github-main-20260304-213500:sync/from-github-main-20260304-213500",
      ],
    ]);
  });
});

describe("formatSuccessMessage", () => {
  it("includes the pushed branch and MR instructions", () => {
    const branchName = "sync/from-github-main-20260304-213500";
    const message = formatSuccessMessage(branchName);

    expect(message).toContain(branchName);
    expect(message).toContain("Create a Gitee MR");
    expect(message).toContain("target branch: main");
  });
});

describe("formatDryRunMessage", () => {
  it("describes the generated branch and planned commands", () => {
    const branchName = "sync/from-github-main-20260304-213500";
    const message = formatDryRunMessage(
      branchName,
      buildSyncPlan({
        branchName,
      }),
    );

    expect(message).toContain(`Planned sync branch: ${branchName}`);
    expect(message).toContain("git fetch origin");
    expect(message).toContain(`git push gitee ${branchName}:${branchName}`);
  });
});

describe("syncGithubMainToGitee", () => {
  it("checks remotes, runs the sync plan, and prints the next step", () => {
    const checkedRemotes: string[] = [];
    const commands: string[][] = [];
    const messages: string[] = [];

    const branchName = syncGithubMainToGitee({
      now: new Date("2026-03-04T21:35:00Z"),
      ensureRemote(remote) {
        checkedRemotes.push(remote);
      },
      runCommand(command) {
        commands.push(command);
      },
      write(message) {
        messages.push(message);
      },
    });

    expect(branchName).toBe("sync/from-github-main-20260304-213500");
    expect(checkedRemotes).toEqual(["origin", "gitee"]);
    expect(commands).toEqual(
      buildSyncPlan({
        branchName,
      }),
    );
    expect(messages).toEqual([formatSuccessMessage(branchName)]);
  });

  it("prints the plan without executing commands in dry-run mode", () => {
    const commands: string[][] = [];
    const messages: string[] = [];

    const branchName = syncGithubMainToGitee({
      now: new Date("2026-03-04T21:35:00Z"),
      dryRun: true,
      ensureRemote() {
        return;
      },
      runCommand(command) {
        commands.push(command);
      },
      write(message) {
        messages.push(message);
      },
    });

    expect(branchName).toBe("sync/from-github-main-20260304-213500");
    expect(commands).toEqual([]);
    expect(messages).toEqual([
      formatDryRunMessage(
        branchName,
        buildSyncPlan({
          branchName,
        }),
      ),
    ]);
  });
});
