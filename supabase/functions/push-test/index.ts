// Sends a test notification to the signed-in user's devices so they can confirm
// reminders actually arrive. Rate limited to one test per 20 seconds.
import { adminClient, corsHeaders, json, requireUser } from '../_shared/http.ts'
import { sendToUser } from '../_shared/push.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)
  const admin = adminClient()
  const user = await requireUser(req, admin)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)

  const { data: prefs } = await admin.from('reminder_prefs').select('last_test_at').eq('user_id', user.id).maybeSingle()
  if (prefs?.last_test_at && Date.now() - new Date(prefs.last_test_at).getTime() < 20_000) {
    return json(req, { sent: 0, failed: 0, removed: 0, message: 'Please wait a few seconds before sending another test.' }, 429)
  }
  await admin.from('reminder_prefs').upsert({ user_id: user.id, last_test_at: new Date().toISOString() }, { onConflict: 'user_id' })

  try {
    const result = await sendToUser(admin, user.id, {
      title: 'BA Coach test notification',
      body: 'Reminders are working on this device.',
      url: '/settings#reminders',
      tag: 'ba-test',
    })
    const message = result.sent ? undefined : 'No active subscription for this account. Tap Enable reminders on your device first.'
    return json(req, { ...result, message })
  } catch (e) {
    return json(req, { sent: 0, failed: 1, removed: 0, message: e instanceof Error ? e.message : 'Push failed' }, 500)
  }
})
