import { describe, expect, it } from "vitest";
import { getLatestCredentialFromState } from "../sim-page.js";

describe("getLatestCredentialFromState", () => {
  it("returns latest credential when state has credentials", () => {
    const result = getLatestCredentialFromState({
      credentials: [
        { appId: "old-app", appSecret: "old-secret", createdAt: 1 },
        { appId: "new-app", appSecret: "new-secret", createdAt: 2 },
      ],
    });

    expect(result).toEqual({ appId: "new-app", appSecret: "new-secret" });
  });

  it("returns null when state has no credential", () => {
    expect(getLatestCredentialFromState({ credentials: [] })).toBeNull();
    expect(getLatestCredentialFromState({})).toBeNull();
  });
});
