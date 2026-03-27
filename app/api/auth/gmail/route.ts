import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail";
import { clearTokens, getTokens } from "@/lib/storage";
import { CodeChallengeMethod } from "google-auth-library";

/** Returns the storage key to use: GHL user ID if present, else the ola_session cookie. */
function getStorageKey(request: NextRequest, fallbackUserId?: string): string | undefined {
  return (
    fallbackUserId ??
    request.headers.get("x-ghl-user-id") ??
    request.nextUrl.searchParams.get("userId") ??
    request.nextUrl.searchParams.get("sessionId") ??
    request.cookies.get("ola_session")?.value ??
    undefined
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  // Status check — used by dashboard poll to detect successful OAuth
  if (action === "status") {
    const key = getStorageKey(request);
    const tokens = await getTokens(key);
    return NextResponse.json({ connected: !!(tokens?.access_token), email: tokens?.email });
  }

  // Initiate OAuth flow
  const ghlUserId = searchParams.get("userId") ?? searchParams.get("sessionId") ?? undefined;

  try {
    const oauth2Client = getOAuthClient();

    const { codeVerifier, codeChallenge } = await oauth2Client.generateCodeVerifierAsync();

    // Encode userId + codeVerifier + session in state (base64url JSON)
    const sessionId = request.cookies.get("ola_session")?.value ?? crypto.randomUUID();
    const statePayload = JSON.stringify({
      userId: ghlUserId ?? null,
      verifier: codeVerifier,
      session: sessionId,
    });
    const state = Buffer.from(statePayload).toString("base64url");

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });

    const response = NextResponse.redirect(authUrl);
    // Set session cookie so it survives across the OAuth redirect chain
    response.cookies.set("ola_session", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return response;
  } catch (error) {
    console.error("Erreur lors de la génération de l'URL OAuth:", error);
    return NextResponse.json(
      { error: "Impossible d'initier la connexion Gmail. Vérifiez votre configuration." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const key = getStorageKey(request);
    await clearTokens(key);
    return NextResponse.json({ success: true, message: "Déconnecté de Gmail" });
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
    return NextResponse.json(
      { error: "Erreur lors de la déconnexion" },
      { status: 500 }
    );
  }
}
