import { describe, it, expect } from "vitest";
import { normalizeWeiboTarget, looksLikeWeiboId, formatWeiboTarget } from "../targets.js";

describe("normalizeWeiboTarget", () => {
  it("returns user:xxx format unchanged", () => {
    expect(normalizeWeiboTarget("user:123456")).toBe("user:123456");
  });

  it("prefixes plain id with user:", () => {
    expect(normalizeWeiboTarget("123456")).toBe("user:123456");
  });

  it("returns empty string for invalid input", () => {
    expect(normalizeWeiboTarget("")).toBe("");
    expect(normalizeWeiboTarget("   ")).toBe("");
  });
});

describe("looksLikeWeiboId", () => {
  it("returns true for numeric strings", () => {
    expect(looksLikeWeiboId("1234567890")).toBe(true);
  });

  it("returns false for non-numeric strings", () => {
    expect(looksLikeWeiboId("user:123")).toBe(false);
    expect(looksLikeWeiboId("abc")).toBe(false);
  });
});

describe("formatWeiboTarget", () => {
  it("returns user:xxx format", () => {
    expect(formatWeiboTarget("123456")).toBe("user:123456");
  });
});
