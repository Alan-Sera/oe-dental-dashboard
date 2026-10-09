import "server-only";

import { prisma } from "@/lib/prisma";
import {
  CALENDAR_EVENTS_SCOPE,
  decryptToken,
  encryptToken,
  getGoogleOAuthConfig,
  isGoogleReconnectRequiredError,
  refreshGoogleAccessToken,
  tryDecryptToken
} from "@/lib/google-drive";

const REFRESH_TOKEN_SETTING = "google.refreshTokenEncrypted";
const DRIVE_REFRESH_TOKEN_SETTING = "google.driveRefreshTokenEncrypted";

export type GoogleConnectionStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  /** true cuando el token concedido incluye el scope calendar.events */
  calendarScope: boolean;
  driveConnected: boolean;
  driveNeedsReconnect: boolean;
};

const DISCONNECTED_STATUS: GoogleConnectionStatus = {
  configured: true,
  connected: false,
  needsReconnect: false,
  calendarScope: false,
  driveConnected: false,
  driveNeedsReconnect: false
};

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const config = getGoogleOAuthConfig();

  if (!config) {
    return { configured: false, connected: false, needsReconnect: false, calendarScope: false, driveConnected: false, driveNeedsReconnect: false };
  }

  const storedToken = await prisma.setting.findUnique({
    where: { key: REFRESH_TOKEN_SETTING }
  });

  if (!storedToken?.value) {
    return { ...DISCONNECTED_STATUS, ...await getDriveConnectionStatus(config) };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(storedToken.value, config.tokenEncryptionKey);
  } catch {
    return { ...DISCONNECTED_STATUS, ...await getDriveConnectionStatus(config), needsReconnect: true };
  }

  try {
    const accessToken = await refreshGoogleAccessToken(config, refreshToken);
    const calendarScope = await hasGoogleCalendarScope(accessToken);
    return { configured: true, connected: true, needsReconnect: false, calendarScope, ...await getDriveConnectionStatus(config) };
  } catch (error) {
    if (isGoogleReconnectRequiredError(error)) {
      return { ...DISCONNECTED_STATUS, ...await getDriveConnectionStatus(config), needsReconnect: true };
    }
    return { configured: true, connected: true, needsReconnect: false, calendarScope: false, ...await getDriveConnectionStatus(config) };
  }
}

async function hasGoogleCalendarScope(accessToken: string) {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { scope?: string };
    return (data.scope ?? "")
      .split(" ")
      .filter(Boolean)
      .includes(CALENDAR_EVENTS_SCOPE);
  } catch {
    return false;
  }
}

export async function storeGoogleRefreshToken(refreshToken: string) {
  const config = getGoogleOAuthConfig();
  if (!config) throw new Error("Google OAuth no está configurado");

  await prisma.setting.upsert({
    where: { key: REFRESH_TOKEN_SETTING },
    create: {
      key: REFRESH_TOKEN_SETTING,
      value: encryptToken(refreshToken, config.tokenEncryptionKey)
    },
    update: {
      value: encryptToken(refreshToken, config.tokenEncryptionKey)
    }
  });
}

export async function getGoogleRefreshToken() {
  const config = getGoogleOAuthConfig();
  if (!config) return null;

  const setting = await prisma.setting.findUnique({
    where: { key: REFRESH_TOKEN_SETTING }
  });

  if (!setting?.value) return null;

  return tryDecryptToken(setting.value, config.tokenEncryptionKey);
}

async function getDriveConnectionStatus(config: NonNullable<ReturnType<typeof getGoogleOAuthConfig>>) {
  const token = await getGoogleDriveRefreshToken();
  if (!token) return { driveConnected: false, driveNeedsReconnect: false };
  try {
    await refreshGoogleAccessToken(config, token);
    return { driveConnected: true, driveNeedsReconnect: false };
  } catch (error) {
    return isGoogleReconnectRequiredError(error)
      ? { driveConnected: false, driveNeedsReconnect: true }
      : { driveConnected: true, driveNeedsReconnect: false };
  }
}

export async function storeGoogleDriveRefreshToken(refreshToken: string) {
  const config = getGoogleOAuthConfig();
  if (!config) throw new Error("Google OAuth no está configurado");
  await prisma.setting.upsert({
    where: { key: DRIVE_REFRESH_TOKEN_SETTING },
    create: { key: DRIVE_REFRESH_TOKEN_SETTING, value: encryptToken(refreshToken, config.tokenEncryptionKey) },
    update: { value: encryptToken(refreshToken, config.tokenEncryptionKey) }
  });
}

export async function getGoogleDriveRefreshToken() {
  const config = getGoogleOAuthConfig();
  if (!config) return null;
  const setting = await prisma.setting.findUnique({ where: { key: DRIVE_REFRESH_TOKEN_SETTING } });
  if (!setting?.value) return null;
  return tryDecryptToken(setting.value, config.tokenEncryptionKey);
}
