import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("sync gitee removal", () => {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const packageJson = readJson(path.join(rootDir, "package.json"));

  it("does not expose the sync:gitee npm script", () => {
    expect(packageJson.scripts["sync:gitee"]).toBeUndefined();
  });

  it("does not keep the sync-gitee implementation files", () => {
    expect(fs.existsSync(path.join(rootDir, "src", "sync-gitee.ts"))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, "scripts", "sync-github-main-to-gitee.ts"))).toBe(false);
  });
});
