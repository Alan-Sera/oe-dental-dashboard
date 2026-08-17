import "server-only";

import { prisma } from "@/lib/prisma";
import {
  decryptToken,
  encryptToken,
  getGoogleOAuthConfig
} from "@/lib/google-drive";

const REFRESH_TOKEN_SETTING = "google.refreshTokenEncrypted";

export async function getGoogleConnectionStatus() {
  const config = getGoogleOAuthConfig();
  const token = await prisma.setting.findUnique({
    where: { key: REFRESH_TOKEN_SETTING }
  });

  return {
    configured: Boolean(config),
    connected: Boolean(config && token?.value)
  };
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
