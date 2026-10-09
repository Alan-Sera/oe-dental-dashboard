import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeOAuthAttempt: vi.fn(),
  getGoogleOAuthConfig: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  storeGoogleDriveRefreshToken: vi.fn(),
  storeGoogleRefreshToken: vi.fn()
}));

vi.mock("@/lib/google-oauth", () => ({ consumeOAuthAttempt: mocks.consumeOAuthAttempt }));
vi.mock("@/lib/google-drive", () => ({
  getGoogleOAuthConfig: mocks.getGoogleOAuthConfig,
  exchangeCodeForTokens: mocks.exchangeCodeForTokens
}));
vi.mock("@/lib/google-settings", () => ({
  storeGoogleDriveRefreshToken: mocks.storeGoogleDriveRefreshToken,
  storeGoogleRefreshToken: mocks.storeGoogleRefreshToken
}));

import { GET } from "@/app/api/google/oauth/callback/route";

const rootFolderId = "1klq70f1-8xqQTfANwUZExFugJNn1xt_m";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeOAuthAttempt.mockResolvedValue({
    returnTo: "/settings",
    redirectUri: "http://127.0.0.1:3000/api/google/oauth/callback",
    codeVerifier: "verifier",
    purpose: "DRIVE_FOLDER_PICKER"
  });
  mocks.getGoogleOAuthConfig.mockReturnValue({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "http://127.0.0.1:3000/api/google/oauth/callback",
    tokenEncryptionKey: "key"
  });
  mocks.exchangeCodeForTokens.mockResolvedValue({
    refresh_token: "drive-refresh-token",
    scope: "https://www.googleapis.com/auth/drive.file"
  });
});

describe("Google OAuth callback token isolation", () => {
  it("does not change either token when authorization is canceled", async () => {
    const response = await GET(new Request("http://127.0.0.1:3000/api/google/oauth/callback?state=state&error=access_denied"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("access-denied");
    expect(mocks.storeGoogleDriveRefreshToken).not.toHaveBeenCalled();
    expect(mocks.storeGoogleRefreshToken).not.toHaveBeenCalled();
  });

  it("does not exchange or save tokens if another folder was selected", async () => {
    const response = await GET(new Request("http://127.0.0.1:3000/api/google/oauth/callback?state=state&code=code&picked_file_ids=other-folder"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("wrong-folder");
    expect(mocks.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(mocks.storeGoogleDriveRefreshToken).not.toHaveBeenCalled();
    expect(mocks.storeGoogleRefreshToken).not.toHaveBeenCalled();
  });

  it("stores only the Drive token after the exact fixed folder is selected", async () => {
    await GET(new Request(`http://127.0.0.1:3000/api/google/oauth/callback?state=state&code=code&picked_file_ids=${rootFolderId}`));

    expect(mocks.storeGoogleDriveRefreshToken).toHaveBeenCalledWith("drive-refresh-token");
    expect(mocks.storeGoogleRefreshToken).not.toHaveBeenCalled();
  });

  it("does not store a token if Google did not grant the Drive file scope", async () => {
    mocks.exchangeCodeForTokens.mockResolvedValueOnce({
      refresh_token: "unexpected-token",
      scope: "https://www.googleapis.com/auth/calendar.events"
    });

    const response = await GET(new Request(`http://127.0.0.1:3000/api/google/oauth/callback?state=state&code=code&picked_file_ids=${rootFolderId}`));
    const html = await response.text();

    expect(html).toContain("missing-drive-scope");
    expect(mocks.storeGoogleDriveRefreshToken).not.toHaveBeenCalled();
    expect(mocks.storeGoogleRefreshToken).not.toHaveBeenCalled();
  });

  it("keeps the Calendar OAuth callback writing only its existing token", async () => {
    mocks.consumeOAuthAttempt.mockResolvedValueOnce({
      returnTo: "/settings",
      redirectUri: "http://127.0.0.1:3000/api/google/oauth/callback",
      codeVerifier: "verifier",
      purpose: "GOOGLE_CONNECT"
    });

    await GET(new Request("http://127.0.0.1:3000/api/google/oauth/callback?state=state&code=code"));

    expect(mocks.storeGoogleRefreshToken).toHaveBeenCalledWith("drive-refresh-token");
    expect(mocks.storeGoogleDriveRefreshToken).not.toHaveBeenCalled();
  });
});
