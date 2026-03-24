import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unscopedPackageName(name: string): string {
  return name.includes("/") ? (name.split("/").pop() ?? name) : name;
}

describe("plugin metadata", () => {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const packageJson = readJson(path.join(rootDir, "package.json"));
  const pluginManifest = readJson(path.join(rootDir, "openclaw.plugin.json"));

  it("keeps the package name aligned with the plugin id", () => {
    expect(unscopedPackageName(packageJson.name)).toBe(pluginManifest.id);
  });

  it("keeps the openclaw channel id as a prefix of the plugin id", () => {
    expect(pluginManifest.id.startsWith(packageJson.openclaw.channel.id)).toBe(true);
  });
});
