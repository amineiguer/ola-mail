import Anthropic from "@anthropic-ai/sdk";
import { getRelevantExamples, type LearningExample } from "./learning";

export interface ExtractedContact {
  name?: string;
  email?: string;
  phone?: string;
  propertyAddress?: string;
  isDemandeInfo: boolean;
}

export interface AnalysisResult {
  isContract: boolean;
  propertyName: string | null;
  confidence: number;
  needsReply: boolean;
  urgency: "urgent" | "normal" | "low";
  suggestedTags: string[];
  category: string | null;
  extractedContact?: ExtractedContact;
}

export interface EmailAnalysisInput {
  subject: string;
  body: string;
  attachments: string[];
  from?: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ── System prompt (stable, injected once) ────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un assistant de classification d'emails pour un courtier immobilier au Québec. Sois CONSERVATEUR et PRÉCIS — il vaut mieux sous-estimer que sur-estimer l'urgence ou l'action requise.

## CATÉGORIES

| Catégorie | Description |
|-----------|-------------|
| visite | Demande de visite reçue d'immocontact ou d'un prospect |
| lead | Alerte automatique d'un portail (nouvelles annonces, prix modifié, stats) — AUCUNE action requise |
| client | Formulaire de contact rempli par un vrai prospect avec ses coordonnées |
| contrat | Promesse d'achat, contrat de courtage, bail — document légal |
| offre | Offre d'achat en cours ou contre-offre |
| signature | Document EZmax/Authentisign/DocuSign à signer |
| inspection | Rapport ou RDV d'inspection |
| financement | Courtier hypothécaire, pré-approbation, banque |
| notaire | Acte de vente, registre foncier, notaire |
| autre | Tout le reste |

## RÈGLE needsReply — LIS ATTENTIVEMENT

needsReply=TRUE SEULEMENT dans ces cas précis:
1. Un VRAI prospect humain a envoyé ses coordonnées et attend un rappel (formulaire rempli)
2. Document EZmax ou Authentisign: signature physique requise du courtier
3. Demande de visite immocontact: le courtier doit confirmer ou refuser
4. Offre d'achat ou contre-offre: décision du courtier requise
5. Email d'un humain réel (client, acheteur, vendeur) posant une question directe nécessitant une réponse
6. Avis légal ou mise en demeure avec délai de réponse explicite

needsReply=FALSE pour TOUT le reste, notamment:
- Alertes Centris, DuProprio, Kijiji (notifications automatiques)
- Confirmations de visite déjà planifiée (action déjà faite)
- Newsletters, marketing, promotions
- Emails de courtiers hypothécaires qui ne sont pas adressés personnellement
- Tout email automatique sans attente de réponse humaine
- Rapports statistiques, bilans, récapitulatifs
- Emails de bienvenue, notifications de compte

## RÈGLE urgency — SOIS TRÈS CONSERVATEUR

urgency="urgent" SEULEMENT si:
- Un délai légal explicite est mentionné avec une date précise (ex: "avant le 26 mars 2026")
- Contre-offre avec expiration dans moins de 48h
- Le mot "URGENT" écrit par un humain réel dans un contexte transactionnel

urgency="normal" pour:
- Visites à planifier (pas urgent, juste à coordonner)
- Prospects qui contactent (rappeler dans la journée, pas urgent)
- EZmax/Authentisign (important mais pas urgent à moins de délai explicite)

urgency="low" pour:
- Toutes les alertes portail automatiques (Centris, DuProprio)
- Newsletters, marketing
- Notifications FYI

## SOURCES CONNUES

**immocontact** → category="visite", needsReply=true, urgency="normal"

**Centris — DISTINCTION CRITIQUE:**
- "Alerte", "nouvelles propriétés", "correspond à vos critères", "prix modifié" → category="lead", needsReply=false, urgency="low"
- Formulaire prospect avec coordonnées réelles → category="client", needsReply=true, urgency="normal"

**DuProprio:**
- Notification/alerte → category="lead", needsReply=false, urgency="low"
- Formulaire prospect → category="client", needsReply=true

**EZmax/Authentisign** → category="signature", isContract=true, needsReply=true, urgency="normal"

## RÈGLE isDemandeInfo

TRUE uniquement si l'email contient un formulaire avec coordonnées RÉELLES d'un prospect:
- Nom, email ou téléphone du prospect
- Propriété d'intérêt
- Message personnel du prospect
FALSE pour tout le reste (notifications, marketing, confirmations automatiques)

## RÈGLE isContract

true UNIQUEMENT si une pièce jointe réelle est présente (PDF, EML, DOC) ET que c'est un document transactionnel, OU si l'expéditeur est EZmax/Authentisign.
false si l'email parle seulement d'un contrat sans y joindre le document.

## EXEMPLES CONCRETS

Email: "Alerte Centris - 3 nouvelles propriétés correspondent à vos critères"
→ category="lead", needsReply=false, urgency="low", isDemandeInfo=false

Email: "Demande de visite - 123 rue des Érables" (de immocontact)
→ category="visite", needsReply=true, urgency="normal"

Email: "Nouveau message de Jean Tremblay via centris.ca - Tél: 514-555-1234"
→ category="client", needsReply=true, urgency="normal", isDemandeInfo=true

Email: "Document prêt pour signature - EZmax"
→ category="signature", isContract=true, needsReply=true, urgency="normal"

Email: "Votre pré-approbation hypothécaire est prête" (banque)
→ category="financement", needsReply=false, urgency="normal"

Email: "CONTRE-OFFRE - Expiration: 26 mars 2026 17h00"
→ category="offre", isContract=true, needsReply=true, urgency="urgent"

Réponds UNIQUEMENT avec du JSON valide. Aucun texte, aucun markdown.`;

// ── Few-shot example formatter ────────────────────────────────────────────────

function formatExamples(examples: LearningExample[]): string {
  if (examples.length === 0) return "";

  const lines = examples.map((ex, i) => {
    const tags = ex.suggestedTags.length > 0 ? `["${ex.suggestedTags.join('","')}"]` : "[]";
    const contact = ex.isDemandeInfo ? ", isDemandeInfo: true" : "";
    return `[${i + 1}] Objet: "${ex.subject}"
    De: ${ex.fromDomain || "inconnu"}
    ${ex.bodySnippet ? `Extrait: "${ex.bodySnippet.substring(0, 120)}"` : ""}
    ✓ category="${ex.category ?? "autre"}", isContract=${ex.isContract}, tags=${tags}${contact}`;
  });

  return `\n=== EXEMPLES CONFIRMÉS PAR CE COURTIER (apprends de ces corrections) ===\n${lines.join("\n\n")}\n\n`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeEmail(input: EmailAnalysisInput): Promise<AnalysisResult> {
  const anthropic = getClient();

  const from = input.from ?? "";
  const attachmentList =
    input.attachments.length > 0
      ? `Pièces jointes: ${input.attachments.join(", ")}`
      : "Aucune pièce jointe";

  const bodyPreview = input.body
    ? `\nCORPS DE L'EMAIL:\n${input.body.substring(0, 3500)}`
    : "";

  // Inject relevant confirmed examples as few-shot context
  const examples = getRelevantExamples(input.subject, from);
  const fewShot = formatExamples(examples);

  const userMessage = `${fewShot}=== EMAIL À ANALYSER ===
Objet: ${input.subject}
Expéditeur: ${from}
${attachmentList}${bodyPreview}

=== JSON ATTENDU ===
{
  "isContract": boolean,
  "propertyName": string | null,
  "confidence": number (0.0-1.0),
  "needsReply": boolean,
  "urgency": "urgent" | "normal" | "low",
  "suggestedTags": string[],
  "category": "lead" | "contrat" | "visite" | "offre" | "signature" | "inspection" | "financement" | "notaire" | "client" | "autre" | null,
  "extractedContact": {
    "name": string | null,
    "email": string | null,
    "phone": string | null,
    "propertyAddress": string | null,
    "isDemandeInfo": boolean
  }
}

Règle pour suggestedTags: retourne UN SEUL tag — le tag catégorie le plus précis. Valeurs autorisées: "lead", "contrat", "visite", "offre", "signature", "inspection", "financement", "notaire", "client". N'inclus AUCUN tag d'action dans suggestedTags.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Réponse inattendue de Claude");

    let jsonText = content.text.trim();
    // Strip potential markdown fences
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonText = fenced[1].trim();
    // Strip leading/trailing non-JSON chars
    const jsonStart = jsonText.indexOf("{");
    const jsonEnd = jsonText.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) jsonText = jsonText.slice(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(jsonText);

    const categoryTags = [
      "lead", "contrat", "visite", "offre", "signature",
      "inspection", "financement", "notaire", "client",
    ];

    // Kept for backward-compat validation but we now restrict to category tags only
    const validTags = categoryTags;

    const validCategories = [
      "lead", "contrat", "visite", "offre", "signature",
      "inspection", "financement", "notaire", "client", "autre",
    ];

    const ec = parsed.extractedContact;
    const extractedContact: ExtractedContact | undefined = ec
      ? {
          name: ec.name || undefined,
          email: ec.email || undefined,
          phone: ec.phone || undefined,
          propertyAddress: ec.propertyAddress || undefined,
          isDemandeInfo: Boolean(ec.isDemandeInfo),
        }
      : undefined;

    // Keep only the first valid category tag (single tag rule)
    const rawTags: string[] = Array.isArray(parsed.suggestedTags)
      ? parsed.suggestedTags.filter((t: string) => validTags.includes(t))
      : [];
    const primaryTag = rawTags[0] ?? null;

    // Auto-add "immo" tag for emails from real-estate platforms
    const fromLower = from.toLowerCase();
    const isImmoSource =
      fromLower.includes("immocontact") ||
      fromLower.includes("centris") ||
      fromLower.includes("duproprio") ||
      fromLower.includes("realtor") ||
      fromLower.includes("via capitale") ||
      fromLower.includes("royal lepage") ||
      fromLower.includes("remax") ||
      fromLower.includes("suttong") ||
      fromLower.includes("exitrealty") ||
      fromLower.includes("keller");

    const finalTags: string[] = [];
    if (primaryTag) finalTags.push(primaryTag);
    if (isImmoSource) finalTags.push("immo");

    // isContract requires a real attachment OR EZmax/Authentisign sender
    const isContractSender = fromLower.includes("ezmax") || fromLower.includes("authentisign");
    const hasRealAttachment = input.attachments.length > 0;
    const isContract = (Boolean(parsed.isContract) && (hasRealAttachment || isContractSender));

    return {
      isContract,
      propertyName: parsed.propertyName || null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      needsReply: Boolean(parsed.needsReply),
      urgency: (["urgent", "normal", "low"].includes(parsed.urgency)
        ? parsed.urgency
        : "normal") as "urgent" | "normal" | "low",
      suggestedTags: finalTags,
      category: validCategories.includes(parsed.category) ? parsed.category : null,
      extractedContact: extractedContact?.isDemandeInfo ? extractedContact : undefined,
    };
  } catch (error) {
    console.error("Erreur analyse Claude:", error);
    if (error instanceof SyntaxError) return detectHeuristic(input);
    throw new Error(`Erreur IA: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
  }
}

// ── Heuristic fallback (no AI) ────────────────────────────────────────────────

function detectHeuristic(input: EmailAnalysisInput): AnalysisResult {
  const text = `${input.subject} ${input.body} ${input.attachments.join(" ")}`.toLowerCase();
  const from = (input.from ?? "").toLowerCase();

  const contractKw = ["contrat", "bail", "compromis", "acte", "promesse d'achat", "offre d'achat", "signature"];
  const urgentKw = ["urgent", "immédiatement", "asap", "contre-offre", "expiration", "délai de réponse"];
  const replyKw = ["demande de visite", "formulaire de contact", "nouveau message de", "a envoyé un message"];

  const matches = contractKw.filter((kw) => text.includes(kw));
  const isContractSenderH = from.includes("ezmax") || from.includes("authentisign");
  const hasAttachmentH = input.attachments.length > 0;
  const isContract =
    (isContractSenderH) ||
    (hasAttachmentH && matches.length >= 1);

  const isVisite = from.includes("immocontact");
  const isLead =
    from.includes("centris.ca") ||
    from.includes("duproprio") ||
    from.includes("kijiji");

  const category = isContract
    ? "contrat"
    : isVisite
    ? "visite"
    : isLead
    ? "lead"
    : null;

  const isImmoSource =
    from.includes("immocontact") ||
    from.includes("centris") ||
    from.includes("duproprio") ||
    from.includes("remax") ||
    from.includes("royallepage") ||
    from.includes("keller");

  const tags: string[] = [];
  if (category) tags.push(category);
  if (isImmoSource) tags.push("immo");

  const needsReply = isVisite ||
    from.includes("ezmax") ||
    from.includes("authentisign") ||
    replyKw.some((k) => text.includes(k));

  const isAutoPortal = isLead && !needsReply;

  return {
    isContract,
    propertyName: null,
    confidence: isContract || isVisite || isLead ? 0.75 : Math.min(0.6, matches.length * 0.15),
    needsReply,
    urgency: urgentKw.some((k) => text.includes(k)) ? "urgent" : isAutoPortal ? "low" : "normal",
    suggestedTags: tags,
    category,
  };
}
