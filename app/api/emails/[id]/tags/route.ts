import { NextRequest, NextResponse } from "next/server";
import { getEmailsCache, saveEmailsCache } from "@/lib/storage";
import { saveLearningExample, extractDomain } from "@/lib/learning";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: emailId } = params;
    const body = await request.json();
    const { tagId } = body;

    if (!tagId || typeof tagId !== "string") {
      return NextResponse.json({ error: "tagId est requis" }, { status: 400 });
    }

    const emails = await getEmailsCache();
    if (!emails) {
      return NextResponse.json({ error: "Cache introuvable" }, { status: 404 });
    }

    const emailIndex = emails.findIndex((e) => e.id === emailId);
    if (emailIndex === -1) {
      return NextResponse.json({ error: "Email introuvable" }, { status: 404 });
    }

    const email = emails[emailIndex];
    const currentTags = email.tags ?? [];

    if (currentTags.includes(tagId)) {
      return NextResponse.json({ tags: currentTags });
    }

    const updatedTags = [...currentTags, tagId];
    const updatedEmails = [...emails];
    updatedEmails[emailIndex] = { ...email, tags: updatedTags };
    await saveEmailsCache(updatedEmails);

    // Auto-learn: manual tag = implicit correction signal
    try {
      saveLearningExample({
        subject: email.subject,
        fromDomain: extractDomain(email.from),
        bodySnippet: (email.body ?? email.snippet ?? "").substring(0, 200),
        category: email.aiTags?.category ?? tagId,
        suggestedTags: updatedTags,
        isContract: email.analysis?.isContract ?? false,
        isDemandeInfo: email.analysis?.extractedContact?.isDemandeInfo ?? false,
        confirmedBy: "user",
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ tags: updatedTags });
  } catch (error) {
    console.error("Erreur ajout tag:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: emailId } = params;
    const tagId = request.nextUrl.searchParams.get("tagId");

    if (!tagId) {
      return NextResponse.json({ error: "tagId est requis" }, { status: 400 });
    }

    const emails = await getEmailsCache();
    if (!emails) {
      return NextResponse.json({ error: "Cache introuvable" }, { status: 404 });
    }

    const emailIndex = emails.findIndex((e) => e.id === emailId);
    if (emailIndex === -1) {
      return NextResponse.json({ error: "Email introuvable" }, { status: 404 });
    }

    const email = emails[emailIndex];
    const updatedTags = (email.tags ?? []).filter((t) => t !== tagId);

    // Also remove from AI-suggested tags so the chip disappears
    const updatedAiTags = email.aiTags
      ? { ...email.aiTags, suggestedTags: (email.aiTags.suggestedTags ?? []).filter((t) => t !== tagId) }
      : email.aiTags;

    const updatedEmails = [...emails];
    updatedEmails[emailIndex] = { ...email, tags: updatedTags, aiTags: updatedAiTags };
    await saveEmailsCache(updatedEmails);

    return NextResponse.json({ tags: updatedTags, aiTags: updatedAiTags });
  } catch (error) {
    console.error("Erreur suppression tag:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
