import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

const SESSION_DAYS = 7;
const PASSWORD_SETTING = "admin.passwordHash";

function getCookieName() {
  return process.env.SESSION_COOKIE_NAME ?? "oe_dental_session";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedValue: string) {
  const [salt, storedHash] = storedValue.split(":");
  if (!salt || !storedHash) return false;

  const hash = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, "hex");

  return storedBuffer.length === hash.length && timingSafeEqual(storedBuffer, hash);
}

export async function hasAdminPassword() {
  const setting = await prisma.setting.findUnique({
    where: { key: PASSWORD_SETTING }
  });

  return Boolean(setting?.value);
}

export async function setAdminPassword(password: string) {
  await prisma.setting.upsert({
    where: { key: PASSWORD_SETTING },
    create: { key: PASSWORD_SETTING, value: hashPassword(password) },
    update: { value: hashPassword(password) }
  });
}

export async function validateAdminPassword(password: string) {
  const setting = await prisma.setting.findUnique({
    where: { key: PASSWORD_SETTING }
  });

  if (!setting?.value) return false;
  return verifyPassword(password, setting.value);
}

export async function createSession() {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const cookieStore = await cookies();

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  cookieStore.set(getCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/"
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCookieName())?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(token) }
    });
  }

  cookieStore.delete(getCookieName());
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCookieName())?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) }
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session;
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
