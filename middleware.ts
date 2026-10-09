import { NextRequest, NextResponse } from "next/server";

/**
 * Google Desktop OAuth only redirects to the loopback origin (no path).
 * Forward that root request internally to the existing callback handler.
 */
export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const isOAuthResponse =
    nextUrl.pathname === "/" &&
    nextUrl.searchParams.has("state") &&
    (nextUrl.searchParams.has("code") || nextUrl.searchParams.has("error"));

  if (!isOAuthResponse) return NextResponse.next();

  const callbackUrl = nextUrl.clone();
  callbackUrl.pathname = "/api/google/oauth/callback";
  return NextResponse.rewrite(callbackUrl);
}

export const config = {
  matcher: "/",
};
