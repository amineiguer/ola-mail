import { NextRequest, NextResponse } from "next/server";
import { getEmails, getAuthenticatedClient } from "@/lib/gmail";
import { getTokens, getEmailsCache, saveEmailsCache, getRules, StoredEmail, Rule } from "@/lib/storage";

/** Instantly tag emails from known Quebec real-estate sources without AI */
function detectEmailSourceTags(email: StoredEmail): string[] {
  const from = (email.from ?? "").toLowerCase();
  const attachments = email.attachments ?? [];
  const tags: string[] = [];

  if (from.includes("immocontact")) {
    tags.push("visite");
  }
  if (from.includes("centris.ca") || from.includes("centris")) {
    tags.push("lead");
  }
  if (from.includes("ezmax") || from.includes("authentisign")) {
    tags.push("contrat");
  }
  if (attachments.some((a) => a.filename.toLowerCase().endsWith(".eml"))) {
    tags.push("contrat");
  }

  return tags;
}

function evaluateCondition(
  email: StoredEmail,
  condition: Rule["conditions"][0]
): boolean {
  const fieldValue = (email[condition.field as keyof StoredEmail] as string ?? "").toLowerCase();
  const condValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case "contains":
      return fieldValue.includes(condValue);
    case "not_contains":
      return !fieldValue.includes(condValue);
    case "equals":
      return fieldValue === condValue;
    case "starts_with":
      return fieldValue.startsWith(condValue);
    default:
      return false;
  }
}

function applyRulesToEmail(email: StoredEmail, rules: Rule[]): StoredEmail {
  const tagsToAdd: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const allMatch = rule.conditions.every((cond) => evaluateCondition(email, cond));
    if (allMatch) {
      tagsToAdd.push(rule.action.tagId);
    }
  }

  if (tagsToAdd.length === 0) return email;

  const currentTags = email.tags ?? [];
  const merged = Array.from(new Set([...currentTags, ...tagsToAdd]));
  return { ...email, tags: merged };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const refresh = searchParams.get("refresh") === "true";
  const labelId = searchParams.get("label") || undefined;
  const daysBack = searchParams.get("days") ? Number(searchParams.get("days")) : 30;

  const ghlUserId = request.headers.get("x-ghl-user-id") ?? searchParams.get("userId") ?? undefined;
  const tokens = await getTokens(ghlUserId);
  if (!tokens || !tokens.access_token) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez connecter Gmail." },
      { status: 401 }
    );
  }

  try {
    // Serve from cache unless refresh requested
    if (!refresh) {
      const cached = await getEmailsCache();
      if (cached && cached.length > 0) {
        const rules = await getRules();
        const withRules = cached.map((e) => applyRulesToEmail(e, rules));
        return NextResponse.json({ emails: withRules });
      }
    }

    // Fetch fresh emails from Gmail (metadata only, batched to respect quota)
    const authClient = await getAuthenticatedClient(tokens, ghlUserId);
    const emails = await getEmails(authClient, 50, labelId, daysBack);

    // Merge with existing analysis / tags / aiTags data from cache
    const existingCache = await getEmailsCache();
    const existingMap = new Map(existingCache?.map((e) => [e.id, e]) ?? []);

    const mergedEmails: StoredEmail[] = emails.map((email) => {
      const existing = existingMap.get(email.id);

      // Instant source-based tag detection (no AI needed)
      const sourceTags = detectEmailSourceTags(existing ?? email);

      if (existing) {
        // Merge source tags with existing tags without duplicates
        const mergedTags = sourceTags.length > 0
          ? Array.from(new Set([...(existing.tags ?? []), ...sourceTags]))
          : existing.tags;
        return {
          ...email,
          // Preserve cached body/bodyHtml — metadata fetch returns empty strings
          body: existing.body || "",
          bodyHtml: existing.bodyHtml,
          hasAttachment: existing.hasAttachment ?? email.hasAttachment,
          attachments: existing.attachments?.length ? existing.attachments : email.attachments,
          analysis: existing.analysis,
          ghlUpload: existing.ghlUpload,
          tags: mergedTags,
          aiTags: existing.aiTags,
          linkedContact: existing.linkedContact,
          // isRead: prefer locally-overridden value; fall back to Gmail's UNREAD label
          isRead: existing.isRead !== undefined ? existing.isRead : email.isRead,
        };
      }
      // New email — apply source tags directly (body will be lazy-loaded on open)
      return { ...email, body: "", bodyHtml: undefined, tags: sourceTags.length > 0 ? sourceTags : undefined };
    });

    // Apply rules
    const rules = await getRules();
    const emailsWithRules = mergedEmails.map((e) => applyRulesToEmail(e, rules));

    // Save to cache (without rule-derived transient tags — save base tags only)
    await saveEmailsCache(mergedEmails);

    return NextResponse.json({ emails: emailsWithRules });
  } catch (error) {
    console.error("Erreur lors de la récupération des emails:", error);
    const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";

    if (
      errorMessage.includes("invalid_grant") ||
      errorMessage.includes("Token has been expired")
    ) {
      return NextResponse.json(
        { error: "Session Gmail expirée. Veuillez vous reconnecter." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Erreur lors de la récupération des emails: ${errorMessage}` },
      { status: 500 }
    );
  }
}
