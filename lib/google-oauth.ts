import { createHash, randomBytes } from "node:crypto";

import { decryptToken, encryptToken, getGoogleOAuthConfig } from "@/lib/google-drive";
import { prisma } from "@/lib/prisma";

const STATE_TTL_MS = 20 * 60 * 1000;

export function createPkcePair() {
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function normalizeOAuthReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/settings";
  }

  try {
    const base = new URL("https://oe-dental.invalid");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return "/settings";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/settings";
  }
}

export type GoogleOAuthPurpose = "GOOGLE_CONNECT" | "DRIVE_FOLDER_PICKER";

export async function createOAuthAttempt(
  returnTo: string,
  redirectUri: string,
  now = new Date(),
  purpose: GoogleOAuthPurpose = "GOOGLE_CONNECT"
) {
  const config = getGoogleOAuthConfig(redirectUri);
  if (!config) throw new Error("Google OAuth no está configurado");

  const state = randomBytes(32).toString("base64url");
  const { codeVerifier, codeChallenge } = createPkcePair();
  const expiresAt = new Date(now.getTime() + STATE_TTL_MS);

  await prisma.$transaction([
    prisma.googleOAuthAttempt.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { consumedAt: { not: null }, createdAt: { lt: new Date(now.getTime() - STATE_TTL_MS) } }
        ]
      }
    }),
    prisma.googleOAuthAttempt.create({
      data: {
        stateHash: hashOAuthState(state),
        codeVerifierEncrypted: encryptToken(codeVerifier, config.tokenEncryptionKey),
        redirectUri,
        returnTo: normalizeOAuthReturnTo(returnTo),
        purpose,
        expiresAt
      }
    })
  ]);

  return { state, codeChallenge };
}

export async function consumeOAuthAttempt(state: string, now = new Date()) {
  const stateHash = hashOAuthState(state);
  const attempt = await prisma.googleOAuthAttempt.findUnique({ where: { stateHash } });

  if (!attempt || attempt.consumedAt || attempt.expiresAt < now) return null;

  const claimed = await prisma.googleOAuthAttempt.updateMany({
    where: { id: attempt.id, consumedAt: null, expiresAt: { gte: now } },
    data: { consumedAt: now }
  });
  if (claimed.count !== 1) return null;

  const config = getGoogleOAuthConfig(attempt.redirectUri);
  if (!config) return null;

  try {
    return {
      returnTo: normalizeOAuthReturnTo(attempt.returnTo),
      redirectUri: attempt.redirectUri,
      purpose: attempt.purpose as GoogleOAuthPurpose,
      codeVerifier: decryptToken(attempt.codeVerifierEncrypted, config.tokenEncryptionKey)
    };
  } catch {
    return null;
  }
}
