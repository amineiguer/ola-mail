import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;        // plain text (for AI)
  bodyHtml?: string;   // original HTML (for rendering)
  hasAttachment: boolean;
  attachments: EmailAttachment[];
  isRead?: boolean;    // false = UNREAD label in Gmail
}

export function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/callback";

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être configurés dans .env"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getAuthenticatedClient(
  tokens: GmailTokens,
  ghlUserId?: string
): Promise<OAuth2Client> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    token_type: tokens.token_type,
  });

  // Auto-refresh token if expired — persist with same ghlUserId
  oauth2Client.on("tokens", async (newTokens) => {
    if (newTokens.access_token) {
      const { saveTokens } = await import("@/lib/storage");
      await saveTokens({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
        expiry_date: newTokens.expiry_date ?? undefined,
        token_type: newTokens.token_type ?? undefined,
        scope: tokens.scope,
      }, ghlUserId);
    }
  });

  return oauth2Client;
}

function decodeBase64(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const buff = Buffer.from(base64, "base64");
    return buff.toString("utf-8");
  } catch {
    return "";
  }
}

type Payload = {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: unknown[];
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
};

/** Collect inline image parts (cid: references) — returns map of contentId → {mimeType, attachmentId} */
function extractInlineImages(payload: Payload): Map<string, { mimeType: string; attachmentId: string }> {
  const map = new Map<string, { mimeType: string; attachmentId: string }>();
  if (!payload) return map;

  const headers = payload.headers ?? [];
  const contentId = headers.find((h) => h.name?.toLowerCase() === "content-id")?.value;
  const disposition = headers.find((h) => h.name?.toLowerCase() === "content-disposition")?.value ?? "";
  const isInline = disposition.toLowerCase().startsWith("inline") || !!contentId;

  if (isInline && payload.body?.attachmentId && payload.mimeType?.startsWith("image/")) {
    const id = contentId ? contentId.replace(/^<|>$/g, "").trim() : "";
    if (id) {
      map.set(id, { mimeType: payload.mimeType, attachmentId: payload.body.attachmentId });
    }
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts as Payload[]) {
      const sub = extractInlineImages(part);
      sub.forEach((v, k) => map.set(k, v));
    }
  }
  return map;
}

function extractPlainBody(payload: Payload): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return decodeBase64(payload.body.data);
  if (payload.mimeType === "text/html" && payload.body?.data)
    return decodeBase64(payload.body.data).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts as Payload[]) {
      const t = extractPlainBody(part);
      if (t) return t;
    }
  }
  return "";
}

// Legacy alias used elsewhere
const extractBody = extractPlainBody;

function extractHtmlBody(payload: Payload): string {
  if (!payload) return "";

  // Direct HTML part
  if (payload.mimeType === "text/html" && payload.body?.data)
    return decodeBase64(payload.body.data);

  if (payload.parts && Array.isArray(payload.parts)) {
    const parts = payload.parts as Payload[];

    // For multipart/alternative: prefer HTML over plain
    if (payload.mimeType === "multipart/alternative") {
      const htmlPart = parts.find((p) => p.mimeType === "text/html");
      if (htmlPart?.body?.data) return decodeBase64(htmlPart.body.data);
      // Recurse into nested multiparts
      for (const part of parts) {
        const h = extractHtmlBody(part);
        if (h) return h;
      }
    }

    // For multipart/related, multipart/mixed, etc.: search all parts
    // First look for a nested multipart/alternative
    for (const part of parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const h = extractHtmlBody(part);
        if (h) return h;
      }
    }
    // Then look for a direct text/html part
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data)
        return decodeBase64(part.body.data);
    }
    // Finally recurse into remaining parts
    for (const part of parts) {
      const h = extractHtmlBody(part);
      if (h) return h;
    }
  }

  // Fallback: plain text → linkified HTML
  const plain = extractPlainBody(payload);
  if (plain) {
    const escaped = plain
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // Linkify URLs, emails, phone numbers
    const linked = escaped.replace(
      /(https?:\/\/[^\s<"]+|www\.[^\s<"]+\.[^\s<"]+|[\w.+-]+@[\w-]+\.[\w.]+|\+?[\d][\d\s().-]{6,}\d)/g,
      (m) => {
        const clean = m.replace(/[.)]+$/, "");
        const href = /^https?:\/\//i.test(clean)
          ? clean
          : /^www\./i.test(clean)
          ? `https://${clean}`
          : /@/.test(clean)
          ? `mailto:${clean}`
          : `tel:${clean.replace(/\s/g, "")}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:underline;">${clean}</a>${m.slice(clean.length)}`;
      }
    );
    return `<pre style="white-space:pre-wrap;font-family:inherit;font-size:15px;line-height:1.8;">${linked}</pre>`;
  }
  return "";
}

function extractAttachments(payload: Payload): EmailAttachment[] {
  const attachments: EmailAttachment[] = [];
  if (!payload) return attachments;

  const headers = payload.headers ?? [];
  const contentId = headers.find((h) => h.name?.toLowerCase() === "content-id")?.value;
  const disposition = headers.find((h) => h.name?.toLowerCase() === "content-disposition")?.value ?? "";
  const isInline = disposition.toLowerCase().startsWith("inline") || !!contentId;

  // Skip inline images — they render inside the email body via cid: references
  if (!isInline && payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) {
    attachments.push({
      filename: payload.filename,
      mimeType: payload.mimeType || "application/octet-stream",
      attachmentId: payload.body.attachmentId,
      size: payload.body.size || 0,
    });
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts as Payload[]) {
      attachments.push(...extractAttachments(part));
    }
  }

  return attachments;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
}

export async function getLabels(authClient: OAuth2Client): Promise<GmailLabel[]> {
  const gmail = google.gmail({ version: "v1", auth: authClient });
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels || [];
  return labels.map((l) => ({
    id: l.id || "",
    name: l.name || "",
    type: l.type || "user",
    messagesTotal: l.messagesTotal ?? undefined,
  }));
}

/** Fetch only metadata (Subject/From/Date) for a message — 1 API call, no body */
export async function getEmailMetadata(
  authClient: OAuth2Client,
  messageId: string
): Promise<GmailEmail | null> {
  const gmail = google.gmail({ version: "v1", auth: authClient });

  const msgResponse = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Subject", "From", "Date"],
  });

  const msg = msgResponse.data;
  if (!msg) return null;

  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

  const subject = getHeader("Subject") || "(Sans objet)";
  const from = getHeader("From") || "Inconnu";
  const dateStr = getHeader("Date") || "";

  let date: string;
  try {
    date = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
  } catch {
    date = new Date().toISOString();
  }

  return {
    id: msg.id || messageId,
    threadId: msg.threadId || "",
    subject,
    from,
    date,
    snippet: msg.snippet || "",
    body: "",
    bodyHtml: undefined,
    hasAttachment: false,
    attachments: [],
    isRead: !(msg.labelIds ?? []).includes("UNREAD"),
  };
}

/** Sleep helper for rate-limiting */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getEmails(
  authClient: OAuth2Client,
  maxResults = 50,
  labelId?: string,
  daysBack?: number
): Promise<GmailEmail[]> {
  const gmail = google.gmail({ version: "v1", auth: authClient });

  const queryParts: string[] = [];

  // Date filter
  if (daysBack && daysBack > 0) {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const yyyy = since.getFullYear();
    const mm = String(since.getMonth() + 1).padStart(2, "0");
    const dd = String(since.getDate()).padStart(2, "0");
    queryParts.push(`after:${yyyy}/${mm}/${dd}`);
  }

  const listParams: {
    userId: string;
    maxResults: number;
    q?: string;
    labelIds?: string[];
  } = {
    userId: "me",
    maxResults,
  };

  if (labelId) {
    listParams.labelIds = [labelId];
    if (queryParts.length > 0) listParams.q = queryParts.join(" ");
  } else {
    // Default: inbox
    listParams.labelIds = ["INBOX"];
    if (queryParts.length > 0) listParams.q = queryParts.join(" ");
  }

  const listResponse = await gmail.users.messages.list(listParams);

  const messages = listResponse.data.messages || [];

  if (messages.length === 0) return [];

  // Fetch metadata in batches of 5 with 150ms delay to stay under quota
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 150;
  const results: GmailEmail[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (msg) => {
        if (!msg.id) return null;
        try {
          return await getEmailMetadata(authClient, msg.id);
        } catch (err) {
          console.error(`Erreur metadata pour l'email ${msg.id}:`, err);
          return null;
        }
      })
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < messages.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

export async function getEmailById(
  authClient: OAuth2Client,
  emailId: string
): Promise<GmailEmail | null> {
  const gmail = google.gmail({ version: "v1", auth: authClient });

  const msgResponse = await gmail.users.messages.get({
    userId: "me",
    id: emailId,
    format: "full",
  });

  const msg = msgResponse.data;
  if (!msg) return null;

  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

  const subject = getHeader("Subject") || "(Sans objet)";
  const from = getHeader("From") || "Inconnu";
  const dateStr = getHeader("Date") || "";

  let date: string;
  try {
    date = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
  } catch {
    date = new Date().toISOString();
  }

  const pl = msg.payload as Payload | undefined;
  const body = pl ? extractPlainBody(pl) : "";
  let bodyHtml = pl ? extractHtmlBody(pl) : "";
  const attachments = pl ? extractAttachments(pl) : [];

  // Embed inline images (cid: references) as base64 data URLs so they render in the iframe
  if (bodyHtml && pl) {
    const inlineImages = extractInlineImages(pl);
    if (inlineImages.size > 0) {
      // Fetch all inline images in parallel
      const inlineEntries: Array<[string, { mimeType: string; attachmentId: string }]> = [];
      inlineImages.forEach((v, k) => inlineEntries.push([k, v]));
      const fetchPromises = inlineEntries.map(async ([cid, { mimeType, attachmentId }]) => {
        try {
          const attRes = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId: emailId,
            id: attachmentId,
          });
          const raw = attRes.data.data;
          if (!raw) return null;
          // Gmail uses URL-safe base64, convert to standard
          const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
          return { cid, dataUrl: `data:${mimeType};base64,${b64}` };
        } catch { return null; }
      });

      const resolved = (await Promise.all(fetchPromises)).filter(Boolean) as { cid: string; dataUrl: string }[];
      for (const { cid, dataUrl } of resolved) {
        // Replace all cid: references: src="cid:xxx" → src="data:..."
        const escapedCid = cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        bodyHtml = bodyHtml.replace(new RegExp(`cid:${escapedCid}`, "gi"), dataUrl);
      }
    }
  }

  return {
    id: msg.id || emailId,
    threadId: msg.threadId || "",
    subject,
    from,
    date,
    snippet: msg.snippet || "",
    body: body.substring(0, 4000),   // plain text for AI
    bodyHtml: bodyHtml || undefined,  // HTML with embedded inline images
    hasAttachment: attachments.length > 0,
    attachments,
  };
}

export async function getAttachment(
  authClient: OAuth2Client,
  emailId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const gmail = google.gmail({ version: "v1", auth: authClient });

  try {
    const response = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: emailId,
      id: attachmentId,
    });

    const data = response.data.data;
    if (!data) return null;

    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64");
  } catch (error) {
    console.error("Erreur lors du téléchargement de la pièce jointe:", error);
    return null;
  }
}
