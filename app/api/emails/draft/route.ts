import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getEmailsCache } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailId, emailFrom, emailSubject, emailBody } = body;

    // Try to get email content from directly passed data first (works on Vercel)
    // Fall back to cache (works locally)
    let from = emailFrom;
    let subject = emailSubject;
    let content = emailBody;

    if (!content && emailId) {
      const emails = await getEmailsCache();
      const cached = emails?.find((e) => e.id === emailId);
      if (cached) {
        from = from ?? cached.from;
        subject = subject ?? cached.subject;
        content = content ?? cached.body?.substring(0, 3000) ?? cached.snippet;
      }
    }

    if (!content && !subject) {
      return NextResponse.json({ error: "Contenu de l'email introuvable" }, { status: 404 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configuré" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Tu es un assistant pour un agent immobilier professionnel. Analyse le ton de cet email et rédige une réponse qui correspond exactement à son style de communication.

Email reçu:
- Expéditeur: ${from ?? "inconnu"}
- Sujet: ${subject ?? "sans objet"}
- Contenu: ${content ?? ""}

Instructions:
1. Détecte le ton (ex: "Formel et professionnel", "Informel et amical", "Urgent et direct", etc.)
2. Rédige une réponse courte, naturelle et professionnelle dans le même ton
3. La réponse doit être en français
4. Commence par la salutation appropriée
5. Ne mentionne pas que tu es une IA

Réponds UNIQUEMENT avec ce JSON valide, sans markdown:
{"tone":"le ton en 3-4 mots","draft":"le texte complet de la réponse"}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const parsed = JSON.parse(text.trim());
      return NextResponse.json({ tone: parsed.tone, draft: parsed.draft });
    } catch {
      return NextResponse.json({ tone: "Professionnel", draft: text });
    }
  } catch (error) {
    console.error("Erreur génération brouillon:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du brouillon" },
      { status: 500 }
    );
  }
}
