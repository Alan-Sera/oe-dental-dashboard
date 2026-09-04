import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { createGoogleAuthorizationUrl, getGoogleOAuthConfig } from "@/lib/google-drive";
import { createOAuthState } from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireSession();

  const config = getGoogleOAuthConfig();
  const requestUrl = new URL(request.url);
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get("returnTo"));

  if (!config) {
    return redirectWithGoogleStatus(request, returnTo, "not-configured");
  }

  const state = createOAuthState(returnTo);

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