import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

let configured = false
function configure() {
  if (configured) return
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
  if (!pub || !priv) throw new Error('VAPID keys are not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets).')
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
}

interface SubscriptionRow {
  id: number
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

export interface SendResult {
  sent: number
  failed: number
  removed: number
}

/**
 * Send one notification to every subscription of a user. Expired subscriptions
 * (404/410 from the push service) are deleted; repeated failures (>5) are removed too.
 */
export async function sendToUser(admin: SupabaseClient, userId: string, payload: Record<string, unknown>): Promise<SendResult> {
  configure()
  const { data, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth, failure_count').eq('user_id', userId)
  if (error) throw error
  const result: SendResult = { sent: 0, failed: 0, removed: 0 }
  for (const sub of (data ?? []) as SubscriptionRow[]) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'normal' })
      result.sent++
      await admin.from('push_subscriptions').update({ failure_count: 0, last_success_at: new Date().toISOString() }).eq('id', sub.id)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410 || sub.failure_count >= 5) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
        result.removed++
      } else {
        await admin.from('push_subscriptions').update({ failure_count: sub.failure_count + 1 }).eq('id', sub.id)
        result.failed++
      }
    }
  }
  return result
}
