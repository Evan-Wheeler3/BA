// Scheduled by pg_cron every 5 minutes (see supabase/cron.sql). Decides, per user and
// in their own time zone, whether the main or follow-up reminder is due, and sends it.
import { adminClient } from '../_shared/http.ts'
import { sendToUser } from '../_shared/push.ts'
import { decideReminder, localNow, reminderPayload, type ReminderPrefs } from '../_shared/reminderLogic.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }
  const admin = adminClient()
  const { data, error } = await admin.from('reminder_prefs').select('*').eq('enabled', true)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const now = new Date()
  const summary = { checked: 0, main: 0, followup: 0, sent: 0, failed: 0, removed: 0 }
  for (const row of (data ?? []) as (ReminderPrefs & { user_id: string })[]) {
    summary.checked++
    const kind = decideReminder(row, now)
    if (!kind) continue
    const local = localNow(now, row.timezone || 'UTC')
    // Mark first so an overlapping cron run cannot double-send.
    const column = kind === 'main' ? 'last_reminder_date' : 'last_followup_date'
    const { error: markError } = await admin.from('reminder_prefs').update({ [column]: local.date }).eq('user_id', row.user_id)
    if (markError) continue
    try {
      const r = await sendToUser(admin, row.user_id, reminderPayload(kind, row.next_topic))
      summary[kind]++
      summary.sent += r.sent
      summary.failed += r.failed
      summary.removed += r.removed
    } catch (e) {
      console.error('send failed', row.user_id, e)
      summary.failed++
    }
  }
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
})
