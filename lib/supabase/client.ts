import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    if (!supabaseUrl) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
    }

    if (!supabaseAnonKey) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
    }

    browserClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      },
    );
  }

  return browserClient;
}
