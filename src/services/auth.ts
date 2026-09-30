import { getSupabase } from '../lib/supabase'
import type { Profile } from '../types'

export interface SignUpInput {
  email: string
  password: string
  fullName: string
  phone: string
  country: string
}

/** Returns `needsConfirmation: true` when Supabase requires email confirmation before login. */
export async function signUp(input: SignUpInput): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      // Stored as user metadata and copied to `profiles` by a database trigger.
      // The role is never taken from here: every new account is a client.
      data: { full_name: input.fullName.trim(), phone: input.phone.trim(), country: input.country },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  })
  if (error) throw error
  return { needsConfirmation: !data.session }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

// When the user explicitly signs out, protected pages send them home instead of to /login.
const SIGN_OUT_REDIRECT_WINDOW_MS = 3000
let explicitSignOutAt = 0

/** True shortly after the user clicked "sign out" (not for expired or revoked sessions). */
export function isExplicitSignOut(): boolean {
  return Date.now() - explicitSignOutAt < SIGN_OUT_REDIRECT_WINDOW_MS
}

export async function signOut(): Promise<void> {
  explicitSignOutAt = Date.now()
  const { error } = await getSupabase().auth.signOut()
  if (error) {
    explicitSignOutAt = 0
    throw error
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password })
  if (error) throw error
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}
