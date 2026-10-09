import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
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

export function getGoogleOAuthConfig(redirectUriOverride?: string): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = redirectUriOverride ?? process.env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1";
  const tokenEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !redirectUri || !tokenEncryptionKey) return null;

  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenEncryptionKey
  };
}

export const GOOGLE_OAUTH_SCOPES = [CALENDAR_EVENTS_SCOPE];

export function createGoogleAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
  codeChallenge?: string
) {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);

  return new URL(
    client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_OAUTH_SCOPES,
      include_granted_scopes: true,
      state,
      ...(codeChallenge
        ? { code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256 }
        : {})
    })
  );
}

export function createGoogleDrivePickerAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
  codeChallenge: string,
  folderId: string
) {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  const url = new URL(client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_FILE_SCOPE],
    include_granted_scopes: false,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256
  }));

  url.searchParams.set("trigger_onepick", "true");
  url.searchParams.set("file_ids", folderId);
  url.searchParams.set("mimetypes", "application/vnd.google-apps.folder");
  url.searchParams.set("allow_folder_selection", "true");
  return url;
}

export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
  codeVerifier?: string
): Promise<GoogleTokenResponse> {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  const { tokens } = codeVerifier
    ? await client.getToken({ code, codeVerifier, redirect_uri: config.redirectUri })
    : await client.getToken(code);

  return tokens as GoogleTokenResponse;
}

export class GoogleReconnectRequiredError extends Error {
  constructor() {
    super("El acceso a Google fue revocado o expiró. Reconecta Google para continuar.");
    this.name = "GoogleReconnectRequiredError";
  }
}

export class GoogleDrivePermissionError extends Error {
  constructor(message = "Google Drive no permitió acceder a la carpeta configurada. Revisa los permisos o reconecta Google.") {
    super(message);
    this.name = "GoogleDrivePermissionError";
  }
}

export class GoogleDriveRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "GoogleDriveRequestError";
  }
}

export function isTransientGoogleDriveError(error: unknown) {
  return error instanceof GoogleDriveRequestError && (error.status === 429 || error.status >= 500);
}

export function isMissingGoogleDriveResource(error: unknown) {
  return error instanceof GoogleDriveRequestError && error.status === 404;
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
  folderId,
  appProperties
}: {
  accessToken: string;
  fileName: string;
  fileBuffer: Buffer;
  folderId: string;
  appProperties?: Record<string, string>;
}) {
  const boundary = `oe_dental_${randomBytes(12).toString("hex")}`;
  const metadata = {
    name: fileName.replace(/\.xlsx$/i, ""),
    mimeType: GOOGLE_SHEETS_MIME_TYPE,
    parents: [folderId],
    ...(appProperties ? { appProperties } : {})
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
  const payload = await readDrivePayload<GoogleDriveUploadResult>(response);

  if (!payload.id || !payload.webViewLink) {
    throw new Error("Google Drive no devolvió id o webViewLink");
  }

  return {
    id: payload.id,
    webViewLink: payload.webViewLink
  };
}

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
  capabilities?: { canAddChildren?: boolean };
};

export async function verifyGoogleDriveFolder(accessToken: string, folderId: string) {
  const url = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(folderId)}`);
  url.searchParams.set("fields", "id,name,mimeType,trashed,webViewLink,capabilities(canAddChildren)");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetchWithDriveRetry(url, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const folder = await readDrivePayload<GoogleDriveFile>(response);

  if (folder.trashed) {
    throw new GoogleDriveRequestError(404, "La carpeta de Google Drive está en la papelera.");
  }

  if (folder.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
    throw new Error("El elemento configurado en Google Drive no es una carpeta");
  }
  if (folder.capabilities?.canAddChildren === false) {
    throw new GoogleDrivePermissionError("No tienes permiso para crear archivos dentro de la carpeta de Google Drive configurada.");
  }

  return folder;
}

export async function verifyGoogleDriveFile(accessToken: string, fileId: string) {
  const url = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,mimeType,trashed,webViewLink,parents");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetchWithDriveRetry(url, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const file = await readDrivePayload<GoogleDriveFile>(response);

  if (file.trashed) {
    throw new GoogleDriveRequestError(404, "El archivo de Google Drive está en la papelera.");
  }

  return file;
}

export async function findGoogleDriveResource({
  accessToken,
  parentId,
  patientId,
  resourceType,
  paymentHistorySheetId
}: {
  accessToken: string;
  parentId: string;
  patientId: string;
  resourceType: "patient-folder" | "payment-sheet";
  paymentHistorySheetId?: string;
}) {
  const escapedPatientId = escapeDriveQueryValue(patientId);
  const escapedResourceType = escapeDriveQueryValue(resourceType);
  const escapedParentId = escapeDriveQueryValue(parentId);
  const queryParts = [
    `'${escapedParentId}' in parents`,
    "trashed = false",
    `appProperties has { key='oePatientId' and value='${escapedPatientId}' }`,
    `appProperties has { key='oeResourceType' and value='${escapedResourceType}' }`
  ];
  if (paymentHistorySheetId) {
    queryParts.push(
      `appProperties has { key='oePaymentHistorySheetId' and value='${escapeDriveQueryValue(paymentHistorySheetId)}' }`
    );
  }
  const query = queryParts.join(" and ");
  const url = new URL(DRIVE_FILES_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,mimeType,webViewLink)");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("pageSize", "10");

  const response = await fetchWithDriveRetry(url, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payload = await readDrivePayload<{ files?: GoogleDriveFile[] }>(response);
  return payload.files?.[0] ?? null;
}

export async function createGoogleDriveFolder({
  accessToken,
  parentId,
  name,
  patientId
}: {
  accessToken: string;
  parentId: string;
  name: string;
  patientId: string;
}) {
  const url = new URL(DRIVE_FILES_ENDPOINT);
  url.searchParams.set("fields", "id,name,mimeType,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [parentId],
      appProperties: {
        oePatientId: patientId,
        oeResourceType: "patient-folder"
      }
    })
  });

  return readDrivePayload<GoogleDriveFile>(response);
}

async function fetchWithDriveRetry(input: URL, init: RequestInit, maxAttempts = 3) {
  let response: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    response = await fetch(input, init);
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < maxAttempts - 1) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 4000)
        : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return response as Response;
}

async function readDrivePayload<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GoogleDrivePermissionError(payload.error?.message);
    }
    throw new GoogleDriveRequestError(
      response.status,
      payload.error?.message || `Google Drive respondió con estado ${response.status}`
    );
  }

  return payload;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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

export function tryDecryptToken(value: string, keyInput: string): string | null {
  try {
    return decryptToken(value, keyInput);
  } catch {
    return null;
  }
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
