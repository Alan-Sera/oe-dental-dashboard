import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";

import {
  encryptToken,
  decryptToken,
  tryDecryptToken,
  extractGoogleDriveFolderId,
  createGoogleAuthorizationUrl,
  createGoogleDrivePickerAuthorizationUrl,
  exchangeCodeForTokens,
  refreshGoogleAccessToken,
  uploadXlsxAsGoogleSheet,
  createGoogleDriveFolder,
  verifyGoogleDriveFolder,
  verifyGoogleDriveFile,
  findGoogleDriveResource,
  isMissingGoogleDriveResource,
  isTransientGoogleDriveError,
  GoogleDrivePermissionError,
  GoogleDriveRequestError,
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

  it("decrypts valid tokens and returns null for corrupt ones", () => {
    const encrypted = encryptToken("refresh-token", config.tokenEncryptionKey);

    expect(tryDecryptToken(encrypted, config.tokenEncryptionKey)).toBe("refresh-token");
    expect(tryDecryptToken("garbage-without-format", config.tokenEncryptionKey)).toBeNull();
    expect(tryDecryptToken("v1:missing:parts", config.tokenEncryptionKey)).toBeNull();
    expect(tryDecryptToken(encrypted, "wrong-key")).toBeNull();
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
        scope: ["https://www.googleapis.com/auth/calendar.events"],
        include_granted_scopes: true,
        state: "state-token"
      })
    );
  });

  it("uses a Drive-only desktop one-pick flow scoped to the fixed folder", () => {
    vi.spyOn(OAuth2Client.prototype, "generateAuthUrl").mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=client-id"
    );

    const url = createGoogleDrivePickerAuthorizationUrl(config, "state-token", "challenge", "fixed-folder");

    expect(url.searchParams.get("trigger_onepick")).toBe("true");
    expect(url.searchParams.get("file_ids")).toBe("fixed-folder");
    expect(url.searchParams.get("mimetypes")).toBe("application/vnd.google-apps.folder");
    expect(url.searchParams.get("allow_folder_selection")).toBe("true");
    expect(OAuth2Client.prototype.generateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
      scope: ["https://www.googleapis.com/auth/drive.file"],
      include_granted_scopes: false,
      state: "state-token",
      code_challenge: "challenge"
    }));
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
      folderId: "folder-id",
      appProperties: {
        oePatientId: "patient-id",
        oeResourceType: "payment-sheet",
        oePaymentHistorySheetId: "history-id"
      }
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
    expect(body.toString("utf8")).toContain('"oePatientId":"patient-id"');
    expect(body.toString("utf8")).toContain('"oePaymentHistorySheetId":"history-id"');
  });

  it("filters payment sheets by their stable local identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await findGoogleDriveResource({
      accessToken: "access-token",
      parentId: "folder-id",
      patientId: "patient-id",
      resourceType: "payment-sheet",
      paymentHistorySheetId: "history-id"
    });

    const [url] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.get("q")).toContain("oePaymentHistorySheetId");
    expect(url.searchParams.get("q")).toContain("history-id");
  });

  it("does not blindly retry folder creation POST requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "temporarily unavailable" } }), {
        status: 503,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createGoogleDriveFolder({
        accessToken: "access-token",
        parentId: "root-id",
        name: "Ana Ruiz [ABC123]",
        patientId: "patient-id"
      })
    ).rejects.toBeInstanceOf(GoogleDriveRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies an accessible Drive folder", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "folder-id",
          name: "Pacientes Chetumal",
          mimeType: "application/vnd.google-apps.folder",
          webViewLink: "https://drive.google.com/drive/folders/folder-id",
          capabilities: { canAddChildren: true }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const folder = await verifyGoogleDriveFolder("access-token", "folder-id");

    expect(folder.id).toBe("folder-id");
    expect(folder.name).toBe("Pacientes Chetumal");
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain("/drive/v3/files/folder-id");
    expect(options.headers).toMatchObject({ authorization: "Bearer access-token" });
  });

  it("rejects Drive resources that are not folders", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "file-id", name: "recibo.pdf", mimeType: "application/pdf" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGoogleDriveFolder("access-token", "file-id")).rejects.toThrow(
      "no es una carpeta"
    );
  });

  it("throws a permission error when Drive denies folder access", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "The user does not have sufficient permissions." } }),
        { status: 403, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGoogleDriveFolder("access-token", "folder-id")).rejects.toBeInstanceOf(
      GoogleDrivePermissionError
    );
  });

  it("throws a permission error when the folder is read-only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "folder-id",
          name: "Pacientes Chetumal",
          mimeType: "application/vnd.google-apps.folder",
          capabilities: { canAddChildren: false }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGoogleDriveFolder("access-token", "folder-id")).rejects.toBeInstanceOf(
      GoogleDrivePermissionError
    );
  });

  it("surfaces a request error with status when the folder is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "File not found." } }), {
        status: 404,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await verifyGoogleDriveFolder("access-token", "missing-id").catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(GoogleDriveRequestError);
    expect((error as GoogleDriveRequestError).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("finds Drive resources by appProperties", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          files: [
            {
              id: "drive-folder-id",
              name: "Ana Ruiz [ABC123]",
              mimeType: "application/vnd.google-apps.folder"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const found = await findGoogleDriveResource({
      accessToken: "access-token",
      parentId: "root-id",
      patientId: "patient-id",
      resourceType: "patient-folder"
    });

    expect(found?.id).toBe("drive-folder-id");
    const [url] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const query = url.searchParams.get("q") ?? "";
    expect(query).toContain("oePatientId");
    expect(query).toContain("patient-folder");
    expect(query).toContain("trashed = false");
  });

  it("returns null when no Drive resource matches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const found = await findGoogleDriveResource({
      accessToken: "access-token",
      parentId: "root-id",
      patientId: "patient-id",
      resourceType: "payment-sheet"
    });

    expect(found).toBeNull();
  });

  it.each([429, 500, 503])("treats Drive status %i as transient", (status) => {
    expect(isTransientGoogleDriveError(new GoogleDriveRequestError(status, "retryable"))).toBe(
      true
    );
  });

  it.each([400, 401, 403, 404])("treats Drive status %i as non-transient", (status) => {
    expect(isTransientGoogleDriveError(new GoogleDriveRequestError(status, "final"))).toBe(false);
  });

  it("treats non-Drive errors as non-transient", () => {
    expect(isTransientGoogleDriveError(new Error("boom"))).toBe(false);
    expect(isTransientGoogleDriveError(null)).toBe(false);
  });

  it("detects deleted Drive resources by 404 status", () => {
    expect(
      isMissingGoogleDriveResource(new GoogleDriveRequestError(404, "File not found."))
    ).toBe(true);
    expect(isMissingGoogleDriveResource(new GoogleDriveRequestError(403, "denied"))).toBe(
      false
    );
    expect(isMissingGoogleDriveResource(new GoogleDriveRequestError(500, "boom"))).toBe(false);
    expect(isMissingGoogleDriveResource(new Error("boom"))).toBe(false);
    expect(isMissingGoogleDriveResource(null)).toBe(false);
  });

  it("treats trashed Drive folders as missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "folder-id",
          name: "Pacientes Chetumal",
          mimeType: "application/vnd.google-apps.folder",
          trashed: true
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await verifyGoogleDriveFolder("access-token", "folder-id").catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(GoogleDriveRequestError);
    expect((error as GoogleDriveRequestError).status).toBe(404);
  });

  it("verifies Drive files and treats trashed ones as missing", async () => {
    const okMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sheet-id",
          name: "Historial de pagos",
          mimeType: "application/vnd.google-apps.spreadsheet",
          trashed: false,
          webViewLink: "https://docs.google.com/spreadsheets/d/sheet-id"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", okMock);

    const file = await verifyGoogleDriveFile("access-token", "sheet-id");
    expect(file.id).toBe("sheet-id");

    const trashedMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sheet-id",
          name: "Historial de pagos",
          mimeType: "application/vnd.google-apps.spreadsheet",
          trashed: true
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", trashedMock);

    const trashedError = await verifyGoogleDriveFile("access-token", "sheet-id").catch(
      (caught: unknown) => caught
    );
    expect(trashedError).toBeInstanceOf(GoogleDriveRequestError);
    expect((trashedError as GoogleDriveRequestError).status).toBe(404);

    const missingMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "File not found." } }), {
        status: 404,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", missingMock);

    await expect(verifyGoogleDriveFile("access-token", "missing-id")).rejects.toBeInstanceOf(
      GoogleDriveRequestError
    );
    expect(missingMock).toHaveBeenCalledTimes(1);
  });
});
