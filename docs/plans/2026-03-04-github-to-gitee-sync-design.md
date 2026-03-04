# GitHub To Gitee Sync Script Design

## Context

This repository uses GitHub as the primary development remote (`origin`) and Gitee as a secondary mirror-like remote (`gitee`).
The two `main` branches are intentionally allowed to differ in repository-specific content such as `README.md`, so direct mirroring is not appropriate.

## Goal

Provide a repeatable way to create a one-off sync branch from `origin/main` and push it to `gitee`, so a human can open a Gitee merge request into `gitee/main` and resolve any conflicts there.

## Requirements

- Do not rewrite or reset the user's current working branch.
- Do not directly push to `gitee/main`.
- Create a unique branch name on every run.
- Push the generated branch to `gitee`.
- Leave merge conflict handling to the human in the Gitee MR UI.
- Fail clearly if required remotes or refs are missing.

## Recommended Approach

Add a repository script at `scripts/sync-github-main-to-gitee.sh`.

The script will:

1. Validate that `origin` and `gitee` remotes exist.
2. Fetch `origin` and `gitee`.
3. Create a timestamped branch name like `sync/from-github-main-20260304-213500`.
4. Create a local branch pointing at `origin/main` without switching the user's current branch.
5. Push that branch to `gitee`.
6. Print the branch name and the next manual step: open a Gitee MR from the pushed sync branch into `main`.

## Tradeoffs

### Chosen

Create the branch directly from `origin/main`.

- Pros: minimal local side effects, simple mental model, safe to run repeatedly
- Cons: merge conflicts are discovered later in the Gitee MR rather than locally

### Rejected

Create a local merge branch from `gitee/main` and merge `origin/main` in the script.

- Pros: conflicts surface locally before push
- Cons: script becomes stateful and invasive, can interrupt local branch state, harder to reason about

Use a fixed sync branch name.

- Pros: easier to remember
- Cons: overwrites or collides with previous pending sync branches

## Error Handling

- Missing remote: exit non-zero with a clear message
- Missing `origin/main`: exit non-zero with a clear message
- Branch creation failure: exit non-zero and preserve current branch state
- Push failure: exit non-zero and print the failing remote branch

## Testing Strategy

Use unit tests for branch-name generation and command sequencing logic where practical, and keep the shell script thin.
The script should support a dry-run or command-construction mode so tests can validate behavior without running live Git commands.

## User Flow

1. Run `npm run sync:gitee`
2. Review the printed branch name
3. Open Gitee
4. Create an MR from the generated sync branch into `main`
5. Resolve conflicts, such as repository-specific `README.md` differences, in the MR
