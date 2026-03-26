import { NextRequest, NextResponse } from "next/server";
import { getEmailsCache, saveEmailsCache } from "@/lib/storage";
import { saveLearningExample, extractDomain } from "@/lib/learning";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      emailId,
      category,
      tags,
      isContract,
      isDemandeInfo,
    }: {
      emailId: string;
      category: string | null;
      tags: string[];
      isContract: boolean;
      isDemandeInfo: boolean;
    } = body;

    if (!emailId) {
      return NextResponse.json({ error: "emailId requis" }, { status: 400 });
    }

    const cache = await getEmailsCache();
    const email = cache?.find((e) => e.id === emailId);

    if (!email) {
      return NextResponse.json({ error: "Email introuvable" }, { status: 404 });
    }

    // Save as a learning example
    saveLearningExample({
      subject: email.subject,
      fromDomain: extractDomain(email.from),
      bodySnippet: (email.body ?? email.snippet ?? "").substring(0, 200),
      category: category ?? null,
      suggestedTags: tags ?? [],
      isContract: Boolean(isContract),
      isDemandeInfo: Boolean(isDemandeInfo),
      confirmedBy: "user",
    });

    // Also update the email's analysis category in cache so it reflects the correction
    if (cache) {
      const updated = cache.map((e) => {
        if (e.id !== emailId) return e;
        return {
          ...e,
          aiTags: e.aiTags
            ? { ...e.aiTags, category: category ?? e.aiTags.category, suggestedTags: tags ?? e.aiTags.suggestedTags }
            : e.aiTags,
        };
      });
      await saveEmailsCache(updated);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erreur feedback:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
