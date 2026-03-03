import { describe, it, expect } from "vitest";
import { resolveWeiboAllowlistMatch } from "../policy.js";

describe("resolveWeiboAllowlistMatch", () => {
  it("returns true when user is in allowFrom list", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "12345", allowFrom: ["12345", "67890"] })).toBe(true);
  });

  it("returns false when user is not in list", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "11111", allowFrom: ["12345", "67890"] })).toBe(false);
  });

  it("returns false for empty allowFrom", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "12345", allowFrom: [] })).toBe(false);
  });

  it("handles wildcard * in allowFrom", () => {
    expect(resolveWeiboAllowlistMatch({ userId: "12345", allowFrom: ["*"] })).toBe(true);
  });
});
