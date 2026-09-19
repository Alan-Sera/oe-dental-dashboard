import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { exchangeCodeForTokens, getGoogleOAuthConfig } from "@/lib/google-drive";
import { verifyOAuthState } from "@/lib/google-oauth";
import { storeGoogleRefreshToken } from "@/lib/google-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireSession();

  const config = getGoogleOAuthConfig();
  const requestUrl = new URL(request.url);
  const receivedState = requestUrl.searchParams.get("state");
  const googleError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");

  if (!config) {
    return redirectWithGoogleStatus(request, "/import", "not-configured");
  }

  const verified = receivedState ? verifyOAuthState(receivedState) : null;
  if (!verified) {
    return redirectWithGoogleStatus(request, "/import", "invalid-state");
  }

  if (googleError === "access_denied") {
    return redirectWithGoogleStatus(request, verified.returnTo, "access-denied");
  }

  if (!code) {
    return redirectWithGoogleStatus(request, verified.returnTo, "missing-code");
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code);
    if (!tokens.refresh_token) {
      return redirectWithGoogleStatus(request, verified.returnTo, "missing-refresh-token");
    }

    await storeGoogleRefreshToken(tokens.refresh_token);
    return redirectWithGoogleStatus(request, verified.returnTo, "connected");
  } catch {
    return redirectWithGoogleStatus(request, verified.returnTo, "error");
  }
}

function redirectWithGoogleStatus(request: Request, returnTo: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("google", status);

  return NextResponse.redirect(url);
}