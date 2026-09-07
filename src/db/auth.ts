import { getSupabase } from "./client";
import type { Session } from "@supabase/supabase-js";

export type AuthListener = (session: Session | null) => void;

/** Subscribes to auth state; fires immediately with the current session. */
export function onAuth(listener: AuthListener): () => void {
  const sb = getSupabase();
  if (!sb) {
    listener(null);
    return () => {};
  }
  const { data } = sb.auth.onAuthStateChange((_event, session) => listener(session));
  return () => data.subscription.unsubscribe();
}

export function currentSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return Promise.resolve(null);
  return sb.auth.getSession().then((r) => r.data.session);
}

/** Sends a magic sign-in link. The link returns the user to this origin. */
export async function sendMagicLink(email: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured");
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}
