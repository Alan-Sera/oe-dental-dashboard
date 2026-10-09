import { NextResponse } from "next/server";

import { exchangeCodeForTokens, getGoogleOAuthConfig } from "@/lib/google-drive";
import { consumeOAuthAttempt } from "@/lib/google-oauth";
import { storeGoogleDriveRefreshToken, storeGoogleRefreshToken } from "@/lib/google-settings";
import { GOOGLE_PATIENTS_ROOT_ID } from "@/lib/google-constants";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const receivedState = requestUrl.searchParams.get("state");
  const googleError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");

  const verified = receivedState ? await consumeOAuthAttempt(receivedState) : null;
  if (!verified) {
    return oauthResultPage(request, "/settings", "google", "invalid-state");
  }
  const config = getGoogleOAuthConfig(verified.redirectUri);
  const drivePicker = verified.purpose === "DRIVE_FOLDER_PICKER";
  const statusKey = drivePicker ? "drive" : "google";
  if (!config) return oauthResultPage(request, verified.returnTo, statusKey, "not-configured");

  if (googleError === "access_denied") {
    return oauthResultPage(request, verified.returnTo, statusKey, "access-denied");
  }

  if (drivePicker && requestUrl.searchParams.get("picked_file_ids") !== GOOGLE_PATIENTS_ROOT_ID) {
    const status = requestUrl.searchParams.has("picked_file_ids") ? "wrong-folder" : "selection-required";
    return oauthResultPage(request, verified.returnTo, statusKey, status);
  }

  if (!code) {
    return oauthResultPage(request, verified.returnTo, statusKey, "missing-code");
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code, verified.codeVerifier);
    if (!tokens.refresh_token) {
      return oauthResultPage(request, verified.returnTo, statusKey, "missing-refresh-token");
    }

    if (drivePicker) {
      if (!(tokens.scope ?? "").split(" ").includes("https://www.googleapis.com/auth/drive.file")) {
        return oauthResultPage(request, verified.returnTo, statusKey, "missing-drive-scope");
      }
      await storeGoogleDriveRefreshToken(tokens.refresh_token);
    } else {
      await storeGoogleRefreshToken(tokens.refresh_token);
    }
    return oauthResultPage(request, verified.returnTo, statusKey, "connected");
  } catch {
    return oauthResultPage(request, verified.returnTo, statusKey, "error");
  }
}

function oauthResultPage(request: Request, returnTo: string, statusKey: string, status: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set(statusKey, status);
  const success = status === "connected";
  const title = success ? "Google quedó conectado" : "No se pudo conectar Google";
  const body = success
    ? "Puedes cerrar esta pestaña y volver a OE Dental."
    : "Cierra esta pestaña y vuelve a OE Dental para intentarlo de nuevo.";
  return new NextResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p><p><a href="${url.toString()}">Volver a OE Dental</a></p></main><script>if(window.opener){window.opener.postMessage({type:"oe-google-oauth",key:${JSON.stringify(statusKey)},status:${JSON.stringify(status)}},${JSON.stringify(url.origin)});window.close();}</script></body></html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
    }
  });
}
