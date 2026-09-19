import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOAuthState, verifyOAuthState } from "@/lib/google-oauth";

const TEST_KEY = "test-secret-for-oauth-state";

describe("google oauth stateless state", () => {
  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs and verifies a state token with returnTo", () => {
    const token = createOAuthState("/import");
    const result = verifyOAuthState(token);

    expect(result?.state).toHaveLength(48);
    expect(result?.returnTo).toBe("/import");
  });

  it("rejects tampered state tokens", () => {
    const token = createOAuthState("/import");
    const [encoded, signature] = token.split(".");

    expect(verifyOAuthState(`${encoded}x.${signature}`)).toBeNull();
    expect(verifyOAuthState(`${encoded}.${signature}x`)).toBeNull();
  });

  it("rejects state signed with a different secret", () => {
    const token = createOAuthState("/import");
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "another-secret";
    expect(verifyOAuthState(token)).toBeNull();
  });

  it("rejects expired state tokens", () => {
    const now = Date.now();
    const token = createOAuthState("/import", now - 21 * 60 * 1000);
    expect(verifyOAuthState(token, now)).toBeNull();
  });

  it("rejects open-redirect style returnTo values", () => {
    expect(verifyOAuthState(createOAuthState("//evil.example"))).toBeNull();
    expect(verifyOAuthState(createOAuthState("https://evil.example"))).toBeNull();
  });
});