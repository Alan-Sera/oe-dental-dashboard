import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 20 * 60 * 1000;

type OAuthStatePayload = {
  s: string;
  r: string;
  e: number;
};

function getStateSecret() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY no está configurado");
  return secret;
}

function sign(payload: OAuthStatePayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");

  return `${encoded}.${signature}`;
}

export function createOAuthState(returnTo: string, now = Date.now()) {
  return sign({ s: randomBytes(24).toString("hex"), r: returnTo, e: now + STATE_TTL_MS });
}

export function verifyOAuthState(token: string, now = Date.now()) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", getStateSecret()).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
    if (
      typeof payload.s !== "string" ||
      typeof payload.r !== "string" ||
      typeof payload.e !== "number" ||
      payload.e < now
    ) {
      return null;
    }

    if (!payload.r.startsWith("/") || payload.r.startsWith("//")) return null;

    return { state: payload.s, returnTo: payload.r };
  } catch {
    return null;
  }
}