import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getGoogleOAuthConfig: vi.fn(),
  createGoogleAuthorizationUrl: vi.fn(),
  createGoogleDrivePickerAuthorizationUrl: vi.fn(),
  createOAuthAttempt: vi.fn(),
  normalizeOAuthReturnTo: vi.fn((value: string | null | undefined) => value || "/settings")
}));

vi.mock("@/lib/auth", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/google-drive", () => ({
  getGoogleOAuthConfig: mocks.getGoogleOAuthConfig,
  createGoogleAuthorizationUrl: mocks.createGoogleAuthorizationUrl,
  createGoogleDrivePickerAuthorizationUrl: mocks.createGoogleDrivePickerAuthorizationUrl
}));
vi.mock("@/lib/google-oauth", () => ({
  createOAuthAttempt: mocks.createOAuthAttempt,
  normalizeOAuthReturnTo: mocks.normalizeOAuthReturnTo
}));
vi.mock("@/lib/google-constants", () => ({ GOOGLE_PATIENTS_ROOT_ID: "fixed-folder-id" }));

import { GET } from "@/app/api/google/oauth/start/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({ userId: "test-user" });
  mocks.getGoogleOAuthConfig.mockReturnValue({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://127.0.0.1:61495/api/google/oauth/callback"
  });
  mocks.createOAuthAttempt.mockResolvedValue({ state: "state", codeChallenge: "challenge" });
  mocks.createGoogleAuthorizationUrl.mockReturnValue(new URL("https://accounts.google.com/auth"));
  mocks.createGoogleDrivePickerAuthorizationUrl.mockReturnValue(new URL("https://accounts.google.com/drive-auth"));
});

describe("Google OAuth start fallback in Electron", () => {
  it("shows a button that returns to the local app when Calendar OAuth is stuck", async () => {
    const response = await GET(new Request(
      "http://127.0.0.1:61495/api/google/oauth/start?returnTo=%2Fsettings",
      { headers: { "user-agent": "Mozilla/5.0 Electron/44.0.0" } }
    ));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('class="return-link" href="http://127.0.0.1:61495/settings?google=pending"');
    expect(html).toContain("Volver a OE Dental");
    expect(html).toContain("window.location.replace(\"http://127.0.0.1:61495/settings?google=pending\")");
    expect(response.headers.get("content-security-policy")).toContain("style-src 'unsafe-inline'");
    expect(mocks.createOAuthAttempt).toHaveBeenCalledWith(
      "/settings",
      "http://127.0.0.1:61495",
      expect.any(Date),
      "GOOGLE_CONNECT"
    );
  });

  it("uses the app loopback address when OAuth starts through localhost", async () => {
    const response = await GET(new Request(
      "http://localhost:61495/api/google/oauth/start?returnTo=%2Fsettings",
      { headers: { "user-agent": "Mozilla/5.0 Electron/44.0.0" } }
    ));
    const html = await response.text();

    expect(html).toContain('class="return-link" href="http://127.0.0.1:61495/settings?google=pending"');
    expect(html).toContain("window.location.replace(\"http://127.0.0.1:61495/settings?google=pending\")");
    expect(mocks.createOAuthAttempt).toHaveBeenCalledWith(
      "/settings",
      "http://127.0.0.1:61495",
      expect.any(Date),
      "GOOGLE_CONNECT"
    );
  });

  it("returns Drive authorization to Settings with its own pending status", async () => {
    const response = await GET(new Request(
      "http://127.0.0.1:61495/api/google/oauth/start?flow=drive-folder-picker&returnTo=%2Fsettings",
      { headers: { "user-agent": "Mozilla/5.0 Electron/44.0.0" } }
    ));
    const html = await response.text();

    expect(html).toContain('class="return-link" href="http://127.0.0.1:61495/settings?drive=pending"');
    expect(html).toContain("Volver a OE Dental");
    expect(mocks.createOAuthAttempt).toHaveBeenCalledWith(
      "/settings",
      "http://127.0.0.1:61495",
      expect.any(Date),
      "DRIVE_FOLDER_PICKER"
    );
  });

  it("keeps the callback path for non-Electron OAuth clients", async () => {
    await GET(new Request("http://localhost:3000/api/google/oauth/start?returnTo=%2Fsettings"));

    expect(mocks.createOAuthAttempt).toHaveBeenCalledWith(
      "/settings",
      "http://localhost:3000/api/google/oauth/callback",
      expect.any(Date),
      "GOOGLE_CONNECT"
    );
  });
});
