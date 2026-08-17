import { afterEach, describe, expect, it, vi } from "vitest";

import {
  encryptToken,
  decryptToken,
  extractGoogleDriveFolderId,
  refreshGoogleAccessToken,
  uploadXlsxAsGoogleSheet,
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

  it("refreshes a Google access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshGoogleAccessToken(config, "refresh-token");

    expect(token).toBe("access-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" }
      })
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
