import crypto from "crypto";
import { OutlookTokens, saveOutlookTokens } from "@/lib/storage";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export interface OutlookEmail {
  id: string;
  threadId: string; // conversationId
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  hasAttachment: boolean;
  attachments: Array<{
    filename: string;
    mimeType: string;
    attachmentId: string;
    size: number;
  }>;
  isRead: boolean;
}

export function getOutlookAuthUrl(ghlUserId?: string): string {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ||
    "http://localhost:3000/api/auth/outlook/callback";

  if (!clientId) throw new Error("MICROSOFT_CLIENT_ID non configuré");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope:
      "openid email profile offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite",
    prompt: "select_account",
  });

  const state = ghlUserId
    ? `user_${encodeURIComponent(ghlUserId)}`
    : `nonce_${crypto.randomBytes(16).toString("hex")}`;
  params.set("state", state);

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeOutlookCode(code: string): Promise<OutlookTokens> {
  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ||
    "http://localhost:3000/api/auth/outlook/callback";

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Échange de code Outlook échoué: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    token_type: data.token_type,
    scope: data.scope,
  };
}

export async function refreshOutlookToken(
  refreshToken: string,
  ghlUserId: string
): Promise<OutlookTokens> {
  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope:
      "openid email profile offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error("Échec du rafraîchissement du token Outlook");

  const data = await res.json();
  const tokens: OutlookTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    token_type: data.token_type,
    scope: data.scope,
  };

  await saveOutlookTokens(tokens, ghlUserId);
  return tokens;
}

async function graphGet(
  path: string,
  accessToken: string
): Promise<Response> {
  return fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getOutlookUserEmail(accessToken: string): Promise<string | undefined> {
  const res = await graphGet("/me?$select=mail,userPrincipalName", accessToken);
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.mail ?? data.userPrincipalName ?? undefined;
}

export async function getOutlookEmails(
  tokens: OutlookTokens,
  ghlUserId: string,
  maxResults = 50,
  daysBack = 30
): Promise<OutlookEmail[]> {
  // Refresh if expired
  let accessToken = tokens.access_token;
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000) {
    if (!tokens.refresh_token) throw new Error("Token Outlook expiré, veuillez vous reconnecter.");
    const refreshed = await refreshOutlookToken(tokens.refresh_token, ghlUserId);
    accessToken = refreshed.access_token;
  }

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const filter = encodeURIComponent(`receivedDateTime ge ${since}`);
  const select = "id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments";
  const url = `/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$filter=${filter}&$select=${select}`;

  const res = await graphGet(url, accessToken);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur Graph API: ${err}`);
  }

  const data = await res.json();
  const messages: OutlookEmail[] = (data.value ?? []).map((msg: Record<string, unknown>) => {
    const fromObj = msg.from as { emailAddress?: { name?: string; address?: string } } | undefined;
    const fromName = fromObj?.emailAddress?.name ?? "";
    const fromEmail = fromObj?.emailAddress?.address ?? "";
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    return {
      id: `outlook_${msg.id as string}`,
      threadId: `outlook_thread_${msg.conversationId as string}`,
      subject: (msg.subject as string) ?? "(Sans objet)",
      from,
      date: msg.receivedDateTime as string,
      snippet: (msg.bodyPreview as string) ?? "",
      body: "",
      bodyHtml: undefined,
      hasAttachment: !!(msg.hasAttachments),
      attachments: [],
      isRead: !!(msg.isRead),
    };
  });

  return messages;
}

export async function getOutlookEmailBody(
  messageId: string, // without the "outlook_" prefix
  accessToken: string
): Promise<{ body: string; bodyHtml?: string }> {
  const res = await graphGet(
    `/me/messages/${messageId}?$select=body`,
    accessToken
  );
  if (!res.ok) return { body: "" };

  const data = await res.json();
  const bodyContent = data.body?.content ?? "";
  const bodyType = data.body?.contentType ?? "text";

  if (bodyType === "html") {
    return { body: "", bodyHtml: bodyContent };
  }
  return { body: bodyContent };
}

export async function sendOutlookEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  isHtml = false,
  replyToMessageId?: string
): Promise<void> {
  const message = {
    subject,
    body: { contentType: isHtml ? "HTML" : "Text", content: body },
    toRecipients: [{ emailAddress: { address: to } }],
  };

  let url = "/me/sendMail";
  let payload: unknown = { message, saveToSentItems: true };

  if (replyToMessageId) {
    // Strip "outlook_" prefix if present
    const rawId = replyToMessageId.replace(/^outlook_/, "");
    url = `/me/messages/${rawId}/reply`;
    payload = { message: { body: { contentType: isHtml ? "HTML" : "Text", content: body } } };
  }

  const res = await fetch(`${GRAPH_BASE}${url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur envoi Outlook: ${err}`);
  }
}
