import "server-only";

import { prisma } from "@/lib/prisma";
import {
  CALENDAR_EVENTS_SCOPE,
  decryptToken,
  encryptToken,
  getGoogleOAuthConfig,
  isGoogleReconnectRequiredError,
  refreshGoogleAccessToken
} from "@/lib/google-drive";

const REFRESH_TOKEN_SETTING = "google.refreshTokenEncrypted";

export type GoogleConnectionStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  /** true cuando el token concedido incluye el scope calendar.events */
  calendarScope: boolean;
};

const DISCONNECTED_STATUS: GoogleConnectionStatus = {
  configured: true,
  connected: false,
  needsReconnect: false,
  calendarScope: false
};

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const config = getGoogleOAuthConfig();

  if (!config) {
    return { configured: false, connected: false, needsReconnect: false, calendarScope: false };
  }

  const storedToken = await prisma.setting.findUnique({
    where: { key: REFRESH_TOKEN_SETTING }
  });

  if (!storedToken?.value) {
    return DISCONNECTED_STATUS;
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(storedToken.value, config.tokenEncryptionKey);
  } catch {
    return { ...DISCONNECTED_STATUS, needsReconnect: true };
  }

  try {
    const accessToken = await refreshGoogleAccessToken(config, refreshToken);
    const calendarScope = await hasGoogleCalendarScope(accessToken);
    return { configured: true, connected: true, needsReconnect: false, calendarScope };
  } catch (error) {
    if (isGoogleReconnectRequiredError(error)) {
      return { ...DISCONNECTED_STATUS, needsReconnect: true };
    }
    return { configured: true, connected: true, needsReconnect: false, calendarScope: false };
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

  return decryptToken(setting.value, config.tokenEncryptionKey);
}
