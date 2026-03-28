import type { Session, SupabaseClient } from "@supabase/supabase-js";

export async function ensureAnonymousSession(client: SupabaseClient): Promise<Session> {
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (session) {
    return session;
  }

  const { data, error } = await client.auth.signInAnonymously();

  if (error || !data.session) {
    throw error ?? new Error("Anonymous sign-in failed.");
  }

  return data.session;
}
