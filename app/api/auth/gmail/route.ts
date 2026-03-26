import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail";
import { clearTokens, getTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  // Status check — used by dashboard on load
  if (action === "status") {
    const ghlUserId = request.headers.get("x-ghl-user-id") ?? request.nextUrl.searchParams.get("userId") ?? undefined;
    const tokens = await getTokens(ghlUserId);
    return NextResponse.json({ connected: !!(tokens?.access_token), email: tokens?.email });
  }

  // Initiate OAuth flow
  const ghlUserId = request.nextUrl.searchParams.get("userId") ?? undefined;

  try {
    const oauth2Client = getOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      prompt: "consent",
      state: ghlUserId ? encodeURIComponent(ghlUserId) : undefined,
    });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Erreur lors de la génération de l'URL OAuth:", error);
    return NextResponse.json(
      { error: "Impossible d'initier la connexion Gmail. Vérifiez votre configuration." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearTokens();
    return NextResponse.json({ success: true, message: "Déconnecté de Gmail" });
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
    return NextResponse.json(
      { error: "Erreur lors de la déconnexion" },
      { status: 500 }
    );
  }
}
