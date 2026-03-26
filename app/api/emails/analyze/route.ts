import { NextRequest, NextResponse } from "next/server";
import { getEmailById, getAuthenticatedClient } from "@/lib/gmail";
import { analyzeEmail } from "@/lib/anthropic";
import { getTokens, getEmailsCache, saveEmailsCache } from "@/lib/storage";

export async function POST(request: NextRequest) {
  let emailId: string | undefined;

  try {
    const body = await request.json();
    emailId = body.emailId;
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  if (!emailId) {
    return NextResponse.json(
      { error: "emailId est requis" },
      { status: 400 }
    );
  }

  const ghlUserId = request.headers.get("x-ghl-user-id") ?? undefined;
  const tokens = await getTokens(ghlUserId);
  if (!tokens || !tokens.access_token) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez connecter Gmail." },
      { status: 401 }
    );
  }

  try {
    const cache = await getEmailsCache();
    const cachedEmail = cache?.find((e) => e.id === emailId);

    if (cachedEmail?.analysis && cachedEmail?.aiTags) {
      return NextResponse.json({
        analysis: cachedEmail.analysis,
        aiTags: cachedEmail.aiTags,
        cached: true,
      });
    }

    const authClient = await getAuthenticatedClient(tokens, ghlUserId);
    const emailData = await getEmailById(authClient, emailId!);

    if (!emailData) {
      return NextResponse.json({ error: "Email introuvable" }, { status: 404 });
    }

    const cachedFrom = cachedEmail?.from ?? emailData.from ?? "";

    const result = await analyzeEmail({
      subject: emailData.subject,
      body: emailData.body,
      attachments: emailData.attachments.map((a) => a.filename),
      from: cachedFrom,
    });

    const analyzedAt = new Date().toISOString();

    const analysis = {
      isContract: result.isContract,
      propertyName: result.propertyName,
      confidence: result.confidence,
      analyzedAt,
      ...(result.extractedContact ? { extractedContact: result.extractedContact } : {}),
    };

    const aiTags = {
      needsReply: result.needsReply,
      urgency: result.urgency,
      suggestedTags: result.suggestedTags,
      category: result.category,
      analyzedAt,
    };

    if (cache) {
      const updatedCache = cache.map((e) =>
        e.id === emailId
          ? { ...e, analysis, aiTags, body: emailData.body.substring(0, 8000), bodyHtml: emailData.bodyHtml }
          : e
      );
      await saveEmailsCache(updatedCache);
    }

    return NextResponse.json({ analysis, aiTags });
  } catch (error) {
    console.error("Erreur lors de l'analyse de l'email:", error);
    const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json(
      { error: `Erreur lors de l'analyse: ${errorMessage}` },
      { status: 500 }
    );
  }
}
