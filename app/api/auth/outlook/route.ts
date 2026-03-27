import { NextRequest, NextResponse } from "next/server";
import { getOutlookAuthUrl } from "@/lib/outlook";
import { getOutlookTokens, clearOutlookTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  // Status check
  if (action === "status") {
    const ghlUserId =
      request.headers.get("x-ghl-user-id") ??
      searchParams.get("userId") ??
      searchParams.get("sessionId") ??
      undefined;
    if (!ghlUserId) {
      return NextResponse.json({ connected: false });
    }
    const tokens = await getOutlookTokens(ghlUserId);
    return NextResponse.json({
      connected: !!(tokens?.access_token),
      email: tokens?.email,
    });
  }

  // Initiate OAuth flow
  const ghlUserId = searchParams.get("userId") ?? searchParams.get("sessionId") ?? undefined;

  try {
    const authUrl = getOutlookAuthUrl(ghlUserId);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Erreur génération URL OAuth Outlook:", error);
    return NextResponse.json(
      { error: "Impossible d'initier la connexion Outlook. Vérifiez votre configuration." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ghlUserId =
      request.headers.get("x-ghl-user-id") ??
      request.nextUrl.searchParams.get("userId") ??
      undefined;
    if (!ghlUserId) {
      return NextResponse.json({ success: true });
    }
    await clearOutlookTokens(ghlUserId);
    return NextResponse.json({ success: true, message: "Déconnecté d'Outlook" });
  } catch (error) {
    console.error("Erreur déconnexion Outlook:", error);
    return NextResponse.json(
      { error: "Erreur lors de la déconnexion Outlook" },
      { status: 500 }
    );
  }
}
