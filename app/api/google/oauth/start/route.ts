import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  createGoogleAuthorizationUrl,
  getGoogleOAuthConfig
} from "@/lib/google-drive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireSession();

  const config = getGoogleOAuthConfig();
  const requestUrl = new URL(request.url);
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get("returnTo"));

  if (!config) {
    return redirectWithGoogleStatus(request, returnTo, "not-configured");
  }

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });
  cookieStore.set("google_oauth_return_to", returnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600
  });

  return NextResponse.redirect(createGoogleAuthorizationUrl(config, state));
}

function normalizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/import";
  return value;
}

function redirectWithGoogleStatus(request: Request, returnTo: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("google", status);

  return NextResponse.redirect(url);
}
