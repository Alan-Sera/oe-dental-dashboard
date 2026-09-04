import "server-only";

import { prisma } from "@/lib/prisma";
import {
  decryptToken,
  encryptToken,
  getGoogleOAuthConfig,
  isGoogleReconnectRequiredError,
  refreshGoogleAccessToken
} from "@/lib/google-drive";

const REFRESH_TOKEN_SETTING = "google.refreshTokenEncrypted";

export async function getGoogleConnectionStatus() {
  const config = getGoogleOAuthConfig();

  if (!config) {
    return { configured: false, connected: false, needsReconnect: false };
  }

  const storedToken = await prisma.setting.findUnique({
    where: { key: REFRESH_TOKEN_SETTING }
  });

  if (!storedToken?.value) {
    return { configured: true, connected: false, needsReconnect: false };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(storedToken.value, config.tokenEncryptionKey);
  } catch {
    return { configured: true, connected: false, needsReconnect: true };
  }

  try {
    await refreshGoogleAccessToken(config, refreshToken);
    return { configured: true, connected: true, needsReconnect: false };
  } catch (error) {
    if (isGoogleReconnectRequiredError(error)) {
      return { configured: true, connected: false, needsReconnect: true };
    }
    return { configured: true, connected: true, needsReconnect: false };
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
