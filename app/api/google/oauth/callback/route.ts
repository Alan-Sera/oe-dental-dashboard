import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  exchangeCodeForTokens,
  getGoogleOAuthConfig
} from "@/lib/google-drive";
import { storeGoogleRefreshToken } from "@/lib/google-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireSession();

  const config = getGoogleOAuthConfig();
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const returnTo = normalizeReturnTo(cookieStore.get("google_oauth_return_to")?.value);
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  const receivedState = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");

  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_oauth_return_to");

  if (!config) {
    return redirectWithGoogleStatus(request, returnTo, "not-configured");
  }

  if (!expectedState || !receivedState || expectedState !== receivedState) {
    return redirectWithGoogleStatus(request, returnTo, "invalid-state");
  }

  if (!code) {
    return redirectWithGoogleStatus(request, returnTo, "missing-code");
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code);
    if (!tokens.refresh_token) {
      return redirectWithGoogleStatus(request, returnTo, "missing-refresh-token");
    }

    await storeGoogleRefreshToken(tokens.refresh_token);
    return redirectWithGoogleStatus(request, returnTo, "connected");
  } catch {
    return redirectWithGoogleStatus(request, returnTo, "error");
  }
}

function normalizeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/import";
  return value;
}

function redirectWithGoogleStatus(request: Request, returnTo: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("google", status);

  return NextResponse.redirect(url);
}
