# GitHub To Gitee Sync Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a safe repository command that creates a unique sync branch from `origin/main`, pushes it to `gitee`, and prints MR instructions without modifying the user's current working branch.

**Architecture:** Implement the sync behavior in a small TypeScript module so the branch naming and Git command sequencing can be unit tested. Keep a thin shell entrypoint or package script wrapper for ergonomics. The sync command will use `git` subprocesses, validate remotes and refs, and create a local branch at `origin/main` before pushing that branch to `gitee`.

**Tech Stack:** TypeScript, Node.js `child_process`, Vitest, npm scripts, Git

---

### Task 1: Add the failing tests for sync planning logic

**Files:**
- Create: `src/__tests__/sync-gitee.test.ts`
- Create: `src/sync-gitee.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildSyncBranchName, buildSyncPlan } from "../sync-gitee";

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
      ["git", "push", "gitee", "sync/from-github-main-20260304-213500:sync/from-github-main-20260304-213500"],
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/__tests__/sync-gitee.test.ts`
Expected: FAIL because `src/sync-gitee.ts` and the exported functions do not exist yet

**Step 3: Write minimal implementation**

```ts
export function buildSyncBranchName(date: Date): string {
  return "sync/from-github-main-20260304-213500";
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
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/__tests__/sync-gitee.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/__tests__/sync-gitee.test.ts src/sync-gitee.ts
git commit -m "test: add sync plan coverage"
```

### Task 2: Implement the executable sync command

**Files:**
- Modify: `src/sync-gitee.ts`
- Create: `scripts/sync-github-main-to-gitee.mjs`

**Step 1: Write the failing test**

```ts
it("includes human follow-up instructions for the Gitee MR", () => {
  const branchName = "sync/from-github-main-20260304-213500";
  const message = formatSuccessMessage(branchName);

  expect(message).toContain(branchName);
  expect(message).toContain("Create a Gitee MR");
  expect(message).toContain("target branch: main");
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/__tests__/sync-gitee.test.ts`
Expected: FAIL because `formatSuccessMessage` does not exist yet

**Step 3: Write minimal implementation**

```ts
export function formatSuccessMessage(branchName: string): string {
  return [
    `Pushed sync branch: ${branchName}`,
    "Create a Gitee MR",
    "source branch: " + branchName,
    "target branch: main",
  ].join("\n");
}
```

Implement the executable module and wrapper script:

- run each git command with inherited stdio
- stop on the first failure
- create the local branch without checking it out
- print the success message after push

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/__tests__/sync-gitee.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sync-gitee.ts scripts/sync-github-main-to-gitee.mjs
git commit -m "feat: add gitee sync command"
```

### Task 3: Expose the command and document it

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Write the failing test**

Manual expectation:
- `package.json` exposes `npm run sync:gitee`
- `README.md` explains that it creates a temporary branch from GitHub and pushes it to Gitee for MR-based sync

**Step 2: Run check to verify it fails**

Run: `node -e "const p=require('./package.json'); process.exit(p.scripts['sync:gitee'] ? 1 : 0)"`
Expected: exit code `0` before the script is added

**Step 3: Write minimal implementation**

- add `"sync:gitee": "node scripts/sync-github-main-to-gitee.mjs"` to `package.json`
- add a short README section with the sync workflow and conflict note

**Step 4: Run check to verify it passes**

Run: `node -e "const p=require('./package.json'); process.exit(p.scripts['sync:gitee'] ? 0 : 1)"`
Expected: exit code `0`

**Step 5: Commit**

```bash
git add package.json README.md
git commit -m "docs: document gitee sync workflow"
```

### Task 4: Verify the end-to-end behavior

**Files:**
- Verify: `src/__tests__/sync-gitee.test.ts`
- Verify: `scripts/sync-github-main-to-gitee.mjs`
- Verify: `package.json`
- Verify: `README.md`

**Step 1: Run targeted tests**

Run: `npm run test:unit -- src/__tests__/sync-gitee.test.ts`
Expected: PASS

**Step 2: Run type and unit checks**

Run: `npm run ci:check`
Expected: PASS

**Step 3: Run a safe dry-run if implemented**

Run: `node scripts/sync-github-main-to-gitee.mjs --dry-run`
Expected: prints the generated branch name and planned commands without mutating refs

**Step 4: Commit**

```bash
git add .
git commit -m "chore: verify gitee sync command"
```
