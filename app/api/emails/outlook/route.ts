import { NextRequest, NextResponse } from "next/server";
import { getOutlookEmails } from "@/lib/outlook";
import { getOutlookTokens } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const daysBack = searchParams.get("days") ? Number(searchParams.get("days")) : 30;

  const ghlUserId =
    request.headers.get("x-ghl-user-id") ??
    searchParams.get("userId") ??
    undefined;

  if (!ghlUserId) {
    return NextResponse.json(
      { error: "userId requis pour Outlook" },
      { status: 400 }
    );
  }

  const tokens = await getOutlookTokens(ghlUserId);
  if (!tokens?.access_token) {
    return NextResponse.json(
      { error: "Non authentifié Outlook. Veuillez connecter Outlook." },
      { status: 401 }
    );
  }

  try {
    const emails = await getOutlookEmails(tokens, ghlUserId, 50, daysBack);
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("Erreur récupération emails Outlook:", error);
    const msg = error instanceof Error ? error.message : "Erreur inconnue";

    if (msg.includes("401") || msg.includes("InvalidAuthenticationToken")) {
      return NextResponse.json(
        { error: "Session Outlook expirée. Veuillez vous reconnecter." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Erreur Outlook: ${msg}` },
      { status: 500 }
    );
  }
}
