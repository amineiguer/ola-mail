import { NextRequest, NextResponse } from "next/server";
import { getEmailById, getAuthenticatedClient } from "@/lib/gmail";
import { getTokens, getEmailsCache, saveEmailsCache } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;

  const ghlUserId = _req.headers.get("x-ghl-user-id") ?? undefined;
  const tokens = await getTokens(ghlUserId);
  if (!tokens?.access_token) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    // Check if we already have full HTML body cached (skip <pre> fallback — re-fetch for real HTML)
    const cache = await getEmailsCache();
    const cached = cache?.find((e) => e.id === emailId);
    const isRealHtml = cached?.bodyHtml && !cached.bodyHtml.trimStart().startsWith("<pre");
    if (isRealHtml) {
      return NextResponse.json({
        body: cached!.body ?? "",
        bodyHtml: cached!.bodyHtml,
        hasAttachment: cached!.hasAttachment ?? false,
        attachments: cached!.attachments ?? [],
      });
    }

    // Fetch full email body from Gmail
    const authClient = await getAuthenticatedClient(tokens, ghlUserId);
    const email = await getEmailById(authClient, emailId);
    if (!email) {
      return NextResponse.json({ error: "Email introuvable" }, { status: 404 });
    }

    // Update cache with body data
    if (cache) {
      const updatedCache = cache.map((e) => {
        if (e.id !== emailId) return e;
        return {
          ...e,
          body: email.body,
          bodyHtml: email.bodyHtml,
          hasAttachment: email.hasAttachment,
          attachments: email.attachments,
          snippet: email.snippet || e.snippet,
        };
      });
      await saveEmailsCache(updatedCache);
    }

    return NextResponse.json({
      body: email.body,
      bodyHtml: email.bodyHtml,
      hasAttachment: email.hasAttachment,
      attachments: email.attachments,
    });
  } catch (error) {
    console.error("Erreur chargement corps email:", error);
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
