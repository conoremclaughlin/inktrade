'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type AuthResult = { success: true } | { error: string };

/**
 * A sign-up either signs you straight in or asks you to confirm an email.
 *
 * Which one happened is decided by the Supabase project, not by us, so the
 * caller is told rather than left to guess.
 */
type SignUpResult = { success: true; signedIn: boolean } | { error: string };

/** Where confirmation links should land. Only used when confirmations are on. */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:6001';
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signUpWithPassword(
  email: string,
  password: string
): Promise<SignUpResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) {
    return { error: error.message };
  }

  // Supabase returns a session only when the project doesn't require email
  // confirmation — so this reads what actually happened instead of trusting a
  // local flag. A flag can drift out of sync with the server and strand someone
  // on "check your email" for a mail that is never sent, which is exactly the
  // bug this replaces.
  return { success: true, signedIn: data.session !== null };
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
