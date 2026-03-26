import { NextResponse } from "next/server";
import { getEmailById, getAuthenticatedClient } from "@/lib/gmail";
import { analyzeEmail } from "@/lib/anthropic";
import { getTokens, getEmailsCache, saveEmailsCache } from "@/lib/storage";

export async function POST(request: Request) {
  const ghlUserId = request.headers.get("x-ghl-user-id") ?? undefined;
  const tokens = await getTokens(ghlUserId);
  if (!tokens?.access_token) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cache = await getEmailsCache();
  if (!cache || cache.length === 0) {
    return NextResponse.json({ analyzed: 0 });
  }

  // Find emails that haven't been analyzed yet (or force re-analyze all)
  const forceAll = new URL(request.url).searchParams.get("force") === "true";
  const pending = forceAll ? cache : cache.filter((e) => !e.aiTags);
  if (pending.length === 0) {
    return NextResponse.json({ analyzed: 0, total: cache.length });
  }

  try {
    const authClient = await getAuthenticatedClient(tokens, ghlUserId);
    let analyzed = 0;
    const updatedCache = [...cache];

    // Process in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      await Promise.all(batch.map(async (email) => {
        try {
          // Fetch full email if we don't have body
          let body = email.body ?? "";
          let bodyHtml = email.bodyHtml;
          if (!body) {
            const fullEmail = await getEmailById(authClient, email.id);
            if (fullEmail) {
              body = fullEmail.body;
              bodyHtml = fullEmail.bodyHtml;
            }
          }

          const result = await analyzeEmail({
            subject: email.subject,
            body,
            attachments: email.attachments.map((a) => a.filename),
            from: email.from,
          });

          const analyzedAt = new Date().toISOString();
          const idx = updatedCache.findIndex((e) => e.id === email.id);
          if (idx !== -1) {
            updatedCache[idx] = {
              ...updatedCache[idx],
              body: body.substring(0, 8000),
              bodyHtml,
              analysis: {
                isContract: result.isContract,
                propertyName: result.propertyName,
                confidence: result.confidence,
                analyzedAt,
                ...(result.extractedContact ? { extractedContact: result.extractedContact } : {}),
              },
              aiTags: {
                needsReply: result.needsReply,
                urgency: result.urgency,
                suggestedTags: result.suggestedTags,
                category: result.category,
                analyzedAt,
              },
            };
            analyzed++;
          }
        } catch (e) {
          console.error(`Erreur analyse email ${email.id}:`, e);
        }
      }));
    }

    await saveEmailsCache(updatedCache);
    // Return only the emails that changed so the client can patch state in-place
    const changedEmails = updatedCache.filter((e) =>
      pending.some((p) => p.id === e.id)
    );
    return NextResponse.json({ analyzed, total: cache.length, changedEmails });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
