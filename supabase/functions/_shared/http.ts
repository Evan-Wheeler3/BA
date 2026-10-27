import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.118.0'

// Allowed browser origins for user-facing functions. Set APP_ORIGIN to your deployed
// URL (comma-separated for several); localhost is allowed for development.
const allowed = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const ok = allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
}

/** Service-role client: server-side only, bypasses RLS. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Resolve the calling user from the Authorization bearer token. */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<User | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
