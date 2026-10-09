import { describe, expect, it } from "vitest";

import { createPkcePair, hashOAuthState, normalizeOAuthReturnTo } from "@/lib/google-oauth";

describe("google oauth PKCE helpers", () => {
  it("creates a verifier and its S256 challenge", () => {
    const first = createPkcePair();
    const second = createPkcePair();

    expect(first.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(first.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.codeChallenge).not.toBe(first.codeVerifier);
    expect(second.codeVerifier).not.toBe(first.codeVerifier);
  });

  it("hashes OAuth state without storing its raw value", () => {
    expect(hashOAuthState("state-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOAuthState("state-token")).not.toContain("state-token");
  });

  it("only accepts local return paths", () => {
    expect(normalizeOAuthReturnTo("/settings")).toBe("/settings");
    expect(normalizeOAuthReturnTo("/settings?tab=google#drive")).toBe("/settings?tab=google#drive");
    expect(normalizeOAuthReturnTo("//evil.example")).toBe("/settings");
    expect(normalizeOAuthReturnTo("///evil.example")).toBe("/settings");
    expect(normalizeOAuthReturnTo("/\\\\evil.example")).toBe("/settings");
    expect(normalizeOAuthReturnTo("/\\\\@evil.example")).toBe("/settings");
    expect(normalizeOAuthReturnTo("https://evil.example")).toBe("/settings");
  });
});
