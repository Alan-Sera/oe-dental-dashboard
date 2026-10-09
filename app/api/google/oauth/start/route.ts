import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { createGoogleAuthorizationUrl, createGoogleDrivePickerAuthorizationUrl, getGoogleOAuthConfig } from "@/lib/google-drive";
import { createOAuthAttempt, normalizeOAuthReturnTo } from "@/lib/google-oauth";
import { GOOGLE_PATIENTS_ROOT_ID } from "@/lib/google-constants";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireSession();

  const requestUrl = new URL(request.url);
  const returnTo = normalizeOAuthReturnTo(requestUrl.searchParams.get("returnTo"));
  const drivePicker = requestUrl.searchParams.get("flow") === "drive-folder-picker";
  const isElectron = /\bElectron\//i.test(request.headers.get("user-agent") ?? "");
  const redirectUri = isElectron
    ? getElectronLoopbackRedirectUri(requestUrl)
    : new URL("/api/google/oauth/callback", requestUrl.origin).toString();
  const config = getGoogleOAuthConfig(redirectUri);

  if (!config) {
    return redirectWithGoogleStatus(request, returnTo, drivePicker ? "drive" : "google", "not-configured");
  }

  const purpose = drivePicker ? "DRIVE_FOLDER_PICKER" : "GOOGLE_CONNECT";
  const { state, codeChallenge } = await createOAuthAttempt(returnTo, redirectUri, new Date(), purpose);
  const authorizationUrl = drivePicker
    ? createGoogleDrivePickerAuthorizationUrl(config, state, codeChallenge, GOOGLE_PATIENTS_ROOT_ID)
    : createGoogleAuthorizationUrl(config, state, codeChallenge);

  if (isElectron) {
    const localReturnUrl = new URL(returnTo, getElectronLoopbackOrigin(requestUrl));
    localReturnUrl.searchParams.set(drivePicker ? "drive" : "google", "pending");
    const script = `window.open(${JSON.stringify(authorizationUrl.toString())}, "_blank", "noopener");window.location.replace(${JSON.stringify(localReturnUrl.toString())});`;
    return new NextResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conectando Google</title><style>
      :root{color-scheme:dark;font-family:"Segoe UI",sans-serif;background:#101522;color:#eef0f8}
      *{box-sizing:border-box}
      body{display:grid;min-height:100vh;margin:0;padding:24px;place-items:center}
      main{width:min(100%,480px);padding:32px;border:1px solid #343b50;border-radius:16px;background:#171d2b;box-shadow:0 24px 64px #080b1280}
      .eyebrow{margin:0 0 8px;color:#91a5ff;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
      h1{margin:0;font-size:24px;line-height:1.25}
      .message{margin:14px 0 24px;color:#bdc4d6;line-height:1.6}
      .return-link{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:0 18px;border:1px solid #7189f4;border-radius:9px;background:#2448bd;color:#fff;font-weight:650;text-decoration:none;transition:background-color .15s ease,border-color .15s ease}
      .return-link:hover{border-color:#9aabff;background:#3158d1}
      .return-link:focus-visible{outline:3px solid #b7c4ff;outline-offset:3px}
      .hint{margin:16px 0 0;color:#929bb0;font-size:13px;line-height:1.5}
      @media(max-width:480px){main{padding:24px}}
    </style></head><body><main><p class="eyebrow">OE Dental · Google</p><h1>Conectando con Google</h1><p class="message">Google debería abrirse en tu navegador externo. Cuando termines la autorización, regresarás a OE Dental.</p><a class="return-link" href="${escapeHtml(localReturnUrl.toString())}">Volver a OE Dental</a><p class="hint">Si esta pantalla se queda aquí, usa el botón para regresar y vuelve a intentar la conexión desde la app.</p></main><script>${script}</script></body></html>`, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
      }
    });
  }

  return NextResponse.redirect(authorizationUrl);
}

function getElectronLoopbackRedirectUri(requestUrl: URL) {
  return getElectronLoopbackOrigin(requestUrl);
}

function getElectronLoopbackOrigin(requestUrl: URL) {
  const origin = new URL(requestUrl.origin);
  origin.hostname = "127.0.0.1";
  return origin.origin;
}

function redirectWithGoogleStatus(request: Request, returnTo: string, key: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set(key, status);

  return NextResponse.redirect(url);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}
