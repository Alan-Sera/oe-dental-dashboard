import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";

import {
  encryptToken,
  decryptToken,
  extractGoogleDriveFolderId,
  createGoogleAuthorizationUrl,
  exchangeCodeForTokens,
  refreshGoogleAccessToken,
  uploadXlsxAsGoogleSheet,
  GoogleReconnectRequiredError,
  type GoogleOAuthConfig
} from "@/lib/google-drive";

const config: GoogleOAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://127.0.0.1:3000/api/google/oauth/callback",
  tokenEncryptionKey: "local-test-key"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("google drive helpers", () => {
  it("extracts folder ids from Drive links", () => {
    expect(extractGoogleDriveFolderId("https://drive.google.com/drive/folders/folder_123?usp=sharing")).toBe(
      "folder_123"
    );
    expect(extractGoogleDriveFolderId("https://drive.google.com/open?id=folder_456")).toBe("folder_456");
    expect(extractGoogleDriveFolderId("folder_789")).toBe("folder_789");
  });

  it("encrypts and decrypts refresh tokens with the local key", () => {
    const encrypted = encryptToken("refresh-token", config.tokenEncryptionKey);

    expect(encrypted).not.toBe("refresh-token");
    expect(decryptToken(encrypted, config.tokenEncryptionKey)).toBe("refresh-token");
  });

  it("builds the Google authorization URL", () => {
    vi.spyOn(OAuth2Client.prototype, "generateAuthUrl").mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=client-id&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fgoogle%2Foauth%2Fcallback"
    );

    const url = createGoogleAuthorizationUrl(config, "state-token");

    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(OAuth2Client.prototype.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        prompt: "consent",
        scope: [
          "https://www.googleapis.com/auth/drive.file",
          "https://www.googleapis.com/auth/calendar.events"
        ],
        include_granted_scopes: true,
        state: "state-token"
      })
    );
  });

  it("exchanges an authorization code for tokens", async () => {
    vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({
      tokens: { access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600 },
      res: null
    } as never);

    const tokens = await exchangeCodeForTokens(config, "auth-code");

    expect(tokens.access_token).toBe("access-token");
    expect(tokens.refresh_token).toBe("refresh-token");
  });

  it("refreshes a Google access token", async () => {
    const refreshMock = vi
      .spyOn(OAuth2Client.prototype, "refreshAccessToken")
      .mockResolvedValue({ credentials: { access_token: "access-token" }, res: null } as never);

    const token = await refreshGoogleAccessToken(config, "refresh-token");

    expect(token).toBe("access-token");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("throws a reconnect error when the refresh token is revoked", async () => {
    vi.spyOn(OAuth2Client.prototype, "refreshAccessToken").mockRejectedValue({
      code: 400,
      response: {
        data: { error: "invalid_grant", error_description: "Token has been expired or revoked." }
      }
    } as never);

    await expect(refreshGoogleAccessToken(config, "revoked-token")).rejects.toBeInstanceOf(
      GoogleReconnectRequiredError
    );
  });

  it("uploads xlsx files as Google Sheets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "sheet-id", webViewLink: "https://docs.google.com/spreadsheets/d/sheet-id" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadXlsxAsGoogleSheet({
      accessToken: "access-token",
      fileName: "estado-cuenta.xlsx",
      fileBuffer: Buffer.from("xlsx"),
      folderId: "folder-id"
    });

    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = options.body as Buffer;

    expect(result).toEqual({
      id: "sheet-id",
      webViewLink: "https://docs.google.com/spreadsheets/d/sheet-id"
    });
    expect(url.toString()).toContain("uploadType=multipart");
    expect(options.headers).toMatchObject({
      authorization: "Bearer access-token"
    });
    expect(body.toString("utf8")).toContain("application/vnd.google-apps.spreadsheet");
    expect(body.toString("utf8")).toContain('"parents":["folder-id"]');
  });
});