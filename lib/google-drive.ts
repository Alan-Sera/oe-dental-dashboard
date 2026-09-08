import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { OAuth2Client } from "google-auth-library";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: string;
};

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GoogleDriveUploadResult = {
  id: string;
  webViewLink: string;
};

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const tokenEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !redirectUri || !tokenEncryptionKey) return null;

  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenEncryptionKey
  };
}

export const GOOGLE_OAUTH_SCOPES = [DRIVE_FILE_SCOPE, CALENDAR_EVENTS_SCOPE];

export function createGoogleAuthorizationUrl(config: GoogleOAuthConfig, state: string) {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);

  return new URL(
    client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_OAUTH_SCOPES,
      include_granted_scopes: true,
      state
    })
  );
}

export async function exchangeCodeForTokens(config: GoogleOAuthConfig, code: string): Promise<GoogleTokenResponse> {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  const { tokens } = await client.getToken(code);

  return tokens as GoogleTokenResponse;
}

export class GoogleReconnectRequiredError extends Error {
  constructor() {
    super("El acceso a Google fue revocado o expiró. Reconecta Google para continuar.");
    this.name = "GoogleReconnectRequiredError";
  }
}

export function isGoogleReconnectRequiredError(error: unknown) {
  return error instanceof GoogleReconnectRequiredError;
}

export async function refreshGoogleAccessToken(config: GoogleOAuthConfig, refreshToken: string) {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  client.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new Error("Google no devolvió access token");
    }

    return credentials.access_token;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      throw new GoogleReconnectRequiredError();
    }
    throw error;
  }
}

function isInvalidGrantError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { response?: { data?: unknown } };
  const data = candidate.response?.data as { error?: unknown } | undefined;

  return data?.error === "invalid_grant";
}

export async function uploadXlsxAsGoogleSheet({
  accessToken,
  fileName,
  fileBuffer,
  folderId
}: {
  accessToken: string;
  fileName: string;
  fileBuffer: Buffer;
  folderId: string;
}) {
  const boundary = `oe_dental_${randomBytes(12).toString("hex")}`;
  const metadata = {
    name: fileName.replace(/\.xlsx$/i, ""),
    mimeType: GOOGLE_SHEETS_MIME_TYPE,
    parents: [folderId]
  };

  const body = buildMultipartBody({
    boundary,
    metadata,
    mediaMimeType: XLSX_MIME_TYPE,
    media: fileBuffer
  });

  const url = new URL(DRIVE_UPLOAD_ENDPOINT);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`,
      "content-length": String(body.length)
    },
    body
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<GoogleDriveUploadResult> & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `No se pudo subir a Google Drive (${response.status})`);
  }

  if (!payload.id || !payload.webViewLink) {
    throw new Error("Google Drive no devolvió id o webViewLink");
  }

  return {
    id: payload.id,
    webViewLink: payload.webViewLink
  };
}

export function buildMultipartBody({
  boundary,
  metadata,
  mediaMimeType,
  media
}: {
  boundary: string;
  metadata: Record<string, unknown>;
  mediaMimeType: string;
  media: Buffer;
}) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mediaMimeType}\r\n\r\n`),
    media,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
}

export function extractGoogleDriveFolderId(input: string) {
  const value = input.trim();
  if (!value) return "";

  const folderMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];

  try {
    const url = new URL(value);
    return url.searchParams.get("id") ?? value;
  } catch {
    return value;
  }
}

export function encryptToken(token: string, keyInput: string) {
  const key = normalizeEncryptionKey(keyInput);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptToken(value: string, keyInput: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Formato de token Google inválido");
  }

  const decipher = createDecipheriv("aes-256-gcm", normalizeEncryptionKey(keyInput), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function normalizeEncryptionKey(input: string) {
  if (/^[a-f0-9]{64}$/i.test(input)) {
    return Buffer.from(input, "hex");
  }

  try {
    const decoded = Buffer.from(input, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to deterministic hash.
  }

  return createHash("sha256").update(input).digest();
}
