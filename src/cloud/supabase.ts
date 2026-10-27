import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Public, browser-safe configuration. The anon key is designed to be public;
// all data access is protected by Row Level Security (see supabase/migrations).
// Never put the service-role key or any API secret in a VITE_ variable.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const cloudConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  }
  return client
}
