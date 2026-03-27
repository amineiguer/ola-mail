import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail";
import { saveTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000")
    .replace(/\s/g, "")
    .replace(/\/$/, "");

  if (error) {
    return NextResponse.redirect(`${baseUrl}/auth/callback?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/auth/callback?error=missing_code`);
  }

  // Decode state: base64url JSON { userId, verifier, session }
  const state = searchParams.get("state");
  let ghlUserId: string | undefined;
  let codeVerifier: string | undefined;
  let sessionId: string | undefined;

  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
      ghlUserId = parsed.userId ?? undefined;
      codeVerifier = parsed.verifier ?? undefined;
      sessionId = parsed.session ?? undefined;
    } catch {
      // Legacy state format "user_xxx"
      if (state.startsWith("user_")) {
        ghlUserId = decodeURIComponent(state.slice(5));
      }
    }
  }

  // Storage key: GHL user ID is canonical; fall back to session ID from state
  const storageKey =
    ghlUserId ??
    sessionId ??
    crypto.randomUUID(); // last-resort (should not happen in normal GHL flow)

  const effectiveSessionId = sessionId ?? storageKey;

  try {
    const oauth2Client = getOAuthClient();
    const tokenResult = codeVerifier
      ? await oauth2Client.getToken({ code: code!, codeVerifier })
      : await oauth2Client.getToken(code!);
    const { tokens } = tokenResult;

    if (!tokens.access_token) {
      throw new Error("Aucun token d'accès reçu");
    }

    // Verify scopes — skip check if Google omits scope from token response
    if (tokens.scope) {
      const grantedScopes = tokens.scope.split(" ");
      const requiredScopes = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ];
      const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));
      if (missingScopes.length > 0) {
        return NextResponse.redirect(`${baseUrl}/auth/callback?error=insufficient_scope`);
      }
    }

    // Get connected email
    let googleEmail: string | undefined;
    try {
      const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token!);
      googleEmail = tokenInfo.email ?? undefined;
    } catch { /* non-critical */ }

    // Save tokens to Supabase using storageKey (always uses Supabase on production)
    await saveTokens(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
        token_type: tokens.token_type ?? undefined,
        scope: tokens.scope ?? undefined,
        email: googleEmail,
      },
      storageKey
    );

    const successResponse = NextResponse.redirect(`${baseUrl}/auth/callback?success=true`);
    // Persist session cookie so future requests can find the tokens
    successResponse.cookies.set("ola_session", effectiveSessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    successResponse.cookies.delete("pkce_verifier");
    return successResponse;
  } catch (err) {
    console.error("Erreur lors de l'échange du code OAuth:", err);
    return NextResponse.redirect(`${baseUrl}/auth/callback?error=token_exchange_failed`);
  }
}
