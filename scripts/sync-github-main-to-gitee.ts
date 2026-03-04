#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { syncGithubMainToGitee } from "../src/sync-gitee.js";

function runGitCommand(command: string[]): void {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureRemote(remote: string): void {
  const result = spawnSync("git", ["remote", "get-url", remote], {
    stdio: "ignore",
  });

  if (result.status !== 0) {
    console.error(`Missing git remote: ${remote}`);
    process.exit(result.status ?? 1);
  }
}

const dryRun = process.argv.includes("--dry-run");

syncGithubMainToGitee({
  dryRun,
  ensureRemote,
  runCommand: runGitCommand,
  write(message) {
    console.log(message);
  },
});
