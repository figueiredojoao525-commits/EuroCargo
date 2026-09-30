import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
// Publishable key (sb_publishable_...); the legacy anon key is still accepted as a fallback.
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

/** True for keys that must never reach the browser (new secret keys or a legacy service_role JWT). */
function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

function isValidUrl(value: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function checkConfig(url: string, publicKey: string): boolean {
  if (!isValidUrl(url)) {
    console.error('VITE_SUPABASE_URL is not a valid URL.')
    return false
  }
  if (isSecretKey(publicKey)) {
    console.error('The Supabase key in .env is a secret/service_role key. Use the publishable (or legacy anon) key.')
    return false
  }
  return true
}

/** False when the public Supabase variables are missing or unsafe. */
// `Boolean(url && publicKey)` stays first so builds without .env drop the client entirely.
export const isSupabaseConfigured = Boolean(url && publicKey) && checkConfig(url!, publicKey!)

// Only the public publishable/anon key is used in the browser. Access control is
// enforced by Row Level Security and database functions, never by this client.
const client: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, publicKey!) : null

export class NotConfiguredError extends Error {
  constructor() {
    super('supabase_not_configured')
  }
}

export function getSupabase(): SupabaseClient {
  if (!client) throw new NotConfiguredError()
  return client
}
