import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");
const EMAILS_FILE = path.join(DATA_DIR, "emails.json");
const CUSTOM_TAGS_FILE = path.join(DATA_DIR, "custom-tags.json");
const RULES_FILE = path.join(DATA_DIR, "rules.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export interface AppSettings {
  ghlApiKey?: string;
  ghlLocationId?: string;
  crmMemberAccess?: boolean;
}

export interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
  email?: string;
}

export interface StoredEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
  bodyHtml?: string;
  hasAttachment: boolean;
  attachments: Array<{
    filename: string;
    mimeType: string;
    attachmentId: string;
    size: number;
  }>;
  analysis?: {
    isContract: boolean;
    propertyName: string | null;
    confidence: number;
    analyzedAt: string;
    extractedContact?: {
      name?: string;
      email?: string;
      phone?: string;
      propertyAddress?: string;
      isDemandeInfo: boolean;
    };
  };
  ghlUpload?: {
    uploaded: boolean;
    folderId?: string;
    fileUrl?: string;
    uploadedAt?: string;
    error?: string;
  };
  isRead?: boolean;
  tags?: string[];
  aiTags?: {
    needsReply: boolean;
    urgency: "urgent" | "normal" | "low";
    suggestedTags: string[];
    category: string | null;
    analyzedAt: string;
  };
  linkedContact?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}

export interface CustomTag {
  id: string;
  name: string;
  color: string;
  darkColor: string;
  textColor: string;
  darkTextColor: string;
  group: "custom";
  isPredefined: false;
  createdAt: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: Array<{
    field: "from" | "subject" | "snippet";
    operator: "contains" | "equals" | "not_contains" | "starts_with";
    value: string;
  }>;
  action: { tagId: string };
  createdAt: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Erreur de lecture du fichier ${filePath}:`, error);
    return null;
  }
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Silently ignore on read-only filesystems (e.g. Vercel)
  }
}

// Token management — Supabase (production) with file fallback (local dev)
export async function saveTokens(
  tokens: StoredTokens,
  ghlUserId?: string
): Promise<void> {
  if (process.env.SUPABASE_URL) {
    const key = ghlUserId ?? "default";
    const { supabase } = await import("@/lib/supabase");
    await supabase.from("gmail_google_tokens").upsert(
      {
        ghl_user_id: key,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token ?? null,
        google_token_expiry: tokens.expiry_date ?? null,
        google_scopes: tokens.scope ?? null,
        token_type: tokens.token_type ?? "Bearer",
        email: tokens.email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ghl_user_id" }
    );
    return;
  }
  writeJsonFile(TOKENS_FILE, tokens);
}

export async function getTokens(ghlUserId?: string): Promise<StoredTokens | null> {
  if (process.env.SUPABASE_URL) {
    const key = ghlUserId ?? "default";
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase
      .from("gmail_google_tokens")
      .select("google_access_token, google_refresh_token, google_token_expiry, google_scopes, token_type, email")
      .eq("ghl_user_id", key)
      .single();
    if (!data?.google_access_token) return null;
    return {
      access_token: data.google_access_token,
      refresh_token: data.google_refresh_token ?? undefined,
      expiry_date: data.google_token_expiry ?? undefined,
      scope: data.google_scopes ?? undefined,
      token_type: data.token_type ?? undefined,
      email: data.email ?? undefined,
    };
  }
  return readJsonFile<StoredTokens>(TOKENS_FILE);
}

export async function clearTokens(ghlUserId?: string): Promise<void> {
  if (process.env.SUPABASE_URL) {
    const key = ghlUserId ?? "default";
    const { supabase } = await import("@/lib/supabase");
    await supabase
      .from("gmail_google_tokens")
      .update({ google_access_token: null, google_refresh_token: null })
      .eq("ghl_user_id", key);
    return;
  }
  if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE);
}

// Email cache management — Supabase (production) with file fallback (local dev)
export async function saveEmailsCache(emails: StoredEmail[], ghlUserId?: string): Promise<void> {
  if (process.env.SUPABASE_URL) {
    const key = ghlUserId ?? "default";
    const { supabase } = await import("@/lib/supabase");
    await supabase.from("email_cache").upsert(
      { ghl_user_id: key, emails: emails as unknown as Record<string, unknown>[], updated_at: new Date().toISOString() },
      { onConflict: "ghl_user_id" }
    );
    return;
  }
  writeJsonFile(EMAILS_FILE, emails);
}

export async function getEmailsCache(ghlUserId?: string): Promise<StoredEmail[] | null> {
  if (process.env.SUPABASE_URL) {
    const key = ghlUserId ?? "default";
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase
      .from("email_cache")
      .select("emails")
      .eq("ghl_user_id", key)
      .single();
    if (!data?.emails) return null;
    return data.emails as unknown as StoredEmail[];
  }
  return readJsonFile<StoredEmail[]>(EMAILS_FILE);
}

export async function clearEmailsCacheForUser(ghlUserId?: string): Promise<void> {
  if (process.env.SUPABASE_URL) {
    const key = ghlUserId ?? "default";
    const { supabase } = await import("@/lib/supabase");
    await supabase.from("email_cache").delete().eq("ghl_user_id", key);
    return;
  }
  if (fs.existsSync(EMAILS_FILE)) fs.unlinkSync(EMAILS_FILE);
}

export async function updateEmailAnalysis(
  emailId: string,
  analysis: StoredEmail["analysis"],
  ghlUserId?: string
): Promise<void> {
  const emails = await getEmailsCache(ghlUserId);
  if (!emails) return;

  const updated = emails.map((e) =>
    e.id === emailId ? { ...e, analysis } : e
  );
  await saveEmailsCache(updated, ghlUserId);
}

export async function updateEmailGhlUpload(
  emailId: string,
  ghlUpload: StoredEmail["ghlUpload"],
  ghlUserId?: string
): Promise<void> {
  const emails = await getEmailsCache(ghlUserId);
  if (!emails) return;

  const updated = emails.map((e) =>
    e.id === emailId ? { ...e, ghlUpload } : e
  );
  await saveEmailsCache(updated, ghlUserId);
}

export async function clearEmailsCache(): Promise<void> {
  if (fs.existsSync(EMAILS_FILE)) {
    fs.unlinkSync(EMAILS_FILE);
  }
}

// Custom tags management
export async function getCustomTags(): Promise<CustomTag[]> {
  return readJsonFile<CustomTag[]>(CUSTOM_TAGS_FILE) ?? [];
}

export async function saveCustomTags(tags: CustomTag[]): Promise<void> {
  writeJsonFile(CUSTOM_TAGS_FILE, tags);
}

// Rules management
export async function getRules(): Promise<Rule[]> {
  return readJsonFile<Rule[]>(RULES_FILE) ?? [];
}

export async function saveRules(rules: Rule[]): Promise<void> {
  writeJsonFile(RULES_FILE, rules);
}

// Email tags management
export async function updateEmailTags(
  emailId: string,
  tags: string[],
  ghlUserId?: string
): Promise<void> {
  const emails = await getEmailsCache(ghlUserId);
  if (!emails) return;
  await saveEmailsCache(emails.map((e) => (e.id === emailId ? { ...e, tags } : e)), ghlUserId);
}

export async function updateEmailAiTags(
  emailId: string,
  aiTags: StoredEmail["aiTags"],
  ghlUserId?: string
): Promise<void> {
  const emails = await getEmailsCache(ghlUserId);
  if (!emails) return;
  await saveEmailsCache(emails.map((e) => (e.id === emailId ? { ...e, aiTags } : e)), ghlUserId);
}

// App settings management
export async function getSettings(): Promise<AppSettings> {
  return readJsonFile<AppSettings>(SETTINGS_FILE) ?? {};
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  writeJsonFile(SETTINGS_FILE, settings);
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  writeJsonFile(SETTINGS_FILE, updated);
  return updated;
}

// Outlook token management
export interface OutlookTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
  email?: string;
}

export async function saveOutlookTokens(
  tokens: OutlookTokens,
  ghlUserId: string
): Promise<void> {
  if (process.env.SUPABASE_URL) {
    const { supabase } = await import("@/lib/supabase");
    await supabase.from("outlook_tokens").upsert(
      {
        ghl_user_id: ghlUserId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expiry: tokens.expiry_date ?? null,
        scopes: tokens.scope ?? null,
        token_type: tokens.token_type ?? "Bearer",
        email: tokens.email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ghl_user_id" }
    );
  }
}

export async function getOutlookTokens(ghlUserId: string): Promise<OutlookTokens | null> {
  if (process.env.SUPABASE_URL) {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase
      .from("outlook_tokens")
      .select("access_token, refresh_token, token_expiry, scopes, token_type, email")
      .eq("ghl_user_id", ghlUserId)
      .single();
    if (!data?.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? undefined,
      expiry_date: data.token_expiry ?? undefined,
      scope: data.scopes ?? undefined,
      token_type: data.token_type ?? undefined,
      email: data.email ?? undefined,
    };
  }
  return null;
}

export async function clearOutlookTokens(ghlUserId: string): Promise<void> {
  if (process.env.SUPABASE_URL) {
    const { supabase } = await import("@/lib/supabase");
    await supabase
      .from("outlook_tokens")
      .update({ access_token: null, refresh_token: null })
      .eq("ghl_user_id", ghlUserId);
  }
}

export async function updateEmailLinkedContact(
  emailId: string,
  linkedContact: StoredEmail["linkedContact"] | null,
  ghlUserId?: string
): Promise<void> {
  const emails = await getEmailsCache(ghlUserId);
  if (!emails) return;
  await saveEmailsCache(
    emails.map((e) => {
      if (e.id !== emailId) return e;
      if (linkedContact === null) {
        const { linkedContact: _removed, ...rest } = e;
        return rest;
      }
      return { ...e, linkedContact };
    }),
    ghlUserId
  );
}
