import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail";
import { saveTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\s/g, "").replace(/\/$/, "");

  if (error) {
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", error);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code) {
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Decode state: base64url JSON { userId, verifier } — or legacy "user_xxx" format
  const state = searchParams.get("state");
  let ghlUserId: string | undefined;
  let codeVerifier: string | undefined;
  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
      ghlUserId = parsed.userId ?? undefined;
      codeVerifier = parsed.verifier ?? undefined;
    } catch {
      // Legacy state format
      if (state.startsWith("user_")) {
        ghlUserId = decodeURIComponent(state.slice(5));
      }
    }
  }

  try {
    const oauth2Client = getOAuthClient();
    const tokenResult = codeVerifier
      ? await oauth2Client.getToken({ code: code!, codeVerifier })
      : await oauth2Client.getToken(code!);
    const { tokens } = tokenResult;

    if (!tokens.access_token) {
      throw new Error("Aucun token d'accès reçu");
    }

    // Verify that the user granted the required scopes
    const grantedScopes = (tokens.scope ?? "").split(" ");
    const requiredScopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ];
    const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));
    if (missingScopes.length > 0) {
      const redirectUrl = new URL("/auth/callback", baseUrl);
      redirectUrl.searchParams.set("error", "insufficient_scope");
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Get the email of the connected Google account
    let googleEmail: string | undefined;
    try {
      const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token!);
      googleEmail = tokenInfo.email ?? undefined;
    } catch { /* non-critical */ }

    await saveTokens(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
        token_type: tokens.token_type ?? undefined,
        scope: tokens.scope ?? undefined,
        email: googleEmail,
      },
      ghlUserId
    );

    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("success", "true");
    const successResponse = NextResponse.redirect(redirectUrl.toString());
    successResponse.cookies.delete("pkce_verifier");
    return successResponse;
  } catch (err) {
    console.error("Erreur lors de l'échange du code OAuth:", err);
    const redirectUrl = new URL("/auth/callback", baseUrl);
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl.toString());
  }
}
