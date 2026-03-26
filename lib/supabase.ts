import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface GmailTokenRow {
  id?: number;
  ghl_user_id: string;
  user_id?: number | null;
  google_refresh_token?: string | null;
  google_access_token?: string | null;
  google_token_expiry?: number | null;
  google_scopes?: string | null;
  token_type?: string;
  email?: string | null;
  nom_complet?: string | null;
  updated_at?: string;
}
