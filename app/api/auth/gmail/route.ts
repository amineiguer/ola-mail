import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail";
import { clearTokens, getTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  // Status check — used by dashboard on load
  if (action === "status") {
    const tokens = await getTokens();
    return NextResponse.json({ connected: !!(tokens?.access_token) });
  }

  // Initiate OAuth flow
  try {
    const oauth2Client = getOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.compose",
      ],
      prompt: "consent",
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
