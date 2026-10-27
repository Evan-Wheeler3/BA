import { OBJECTIVE_BY_ID } from '../domain/blueprint'
import type { AppState } from '../domain/types'
import { today as todayStr } from '../engine/dates'
import { computeAllStats } from '../engine/mastery'
import { buildMistakes } from '../engine/mistakes'
import { chooseObjective } from '../engine/planner'
import { updateSettings } from '../state/actions'
import { getState } from '../state/store'
import { currentSession } from './sync'
import { VAPID_PUBLIC_KEY, supabase } from './supabase'

export interface PushCapability {
  supported: boolean
  standalone: boolean
  ios: boolean
  permission: NotificationPermission | 'unsupported'
  configured: boolean
  signedIn: boolean
  /** Human-readable reason push cannot be enabled right now, if any. */
  blocker: string | null
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushCapability(): PushCapability {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const ios = isIOS()
  const standalone = isStandalone()
  const configured = !!supabase() && !!VAPID_PUBLIC_KEY
  const signedIn = !!currentSession()
  const permission = supported ? Notification.permission : 'unsupported'
  let blocker: string | null = null
  if (!configured) blocker = 'Push reminders need the Supabase backend and VAPID keys (see README → Reminders). Use the calendar reminder meanwhile.'
  else if (ios && !standalone) blocker = 'On iPhone, add this app to your Home Screen (Share → Add to Home Screen), then open it from the icon to enable reminders.'
  else if (!supported) blocker = 'This browser does not support web push. Use the calendar reminder instead.'
  else if (!signedIn) blocker = 'Sign in (Settings → Account) so the server can deliver reminders to this device.'
  else if (permission === 'denied') blocker = 'Notifications are blocked for this app. Re-enable them in system settings (iPhone: Settings → Notifications → BA Coach).'
  return { supported, standalone, ios, permission, configured, signedIn, blocker }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Must be called from a user tap (iOS requires a user gesture for the permission prompt). */
export async function enableReminders(): Promise<{ ok: boolean; message: string }> {
  const cap = pushCapability()
  if (cap.blocker) return { ok: false, message: cap.blocker }
  const sb = supabase()!
  const session = currentSession()!
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, message: permission === 'denied' ? 'Permission denied. You can re-enable notifications in system settings.' : 'Permission was not granted.' }
  }
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) })
    }
    const json = sub.toJSON()
    const { error } = await sb.from('push_subscriptions').upsert(
      {
        user_id: session.user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent.slice(0, 200),
        failure_count: 0,
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
    updateSettings({ reminders: { ...getState().settings.reminders, enabled: true } })
    await syncReminderPrefs(getState())
    return { ok: true, message: 'Subscribed. Send a test notification to confirm delivery.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not subscribe to push.' }
  }
}

export async function disableReminders(): Promise<{ ok: boolean; message: string }> {
  const sb = supabase()
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      if (sb) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    updateSettings({ reminders: { ...getState().settings.reminders, enabled: false, lastTestOk: undefined } })
    await syncReminderPrefs(getState())
    return { ok: true, message: 'Reminders turned off and this device unsubscribed.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not unsubscribe.' }
  }
}

export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  const sb = supabase()
  if (!sb || !currentSession()) return { ok: false, message: 'Sign in first.' }
  const { data, error } = await sb.functions.invoke('push-test', { body: {} })
  if (error) return { ok: false, message: `Test failed: ${error.message}` }
  const result = data as { sent: number; failed: number; removed: number; message?: string }
  if (result.sent > 0) {
    updateSettings({ reminders: { ...getState().settings.reminders, lastTestOk: Date.now() } })
    return { ok: true, message: `Sent to ${result.sent} device(s). If nothing arrived within a minute, check Focus/Do Not Disturb.` }
  }
  return { ok: false, message: result.message ?? `No notification delivered (${result.failed} failed, ${result.removed} expired subscriptions removed).` }
}

/**
 * Keep the server's reminder preferences in sync: schedule, next topic and whether
 * today's session is complete (so the follow-up reminder is skipped).
 */
export async function syncReminderPrefs(state: AppState, nextObjectiveId?: string) {
  const sb = supabase()
  const session = currentSession()
  if (!sb || !session) return
  const s = state.settings
  const completedDates = state.sessions.filter((x) => x.completedAt).map((x) => x.date).sort()
  const day = todayStr()
  const objectiveId =
    nextObjectiveId ??
    chooseObjective(computeAllStats(state.attempts, state.sessions, day), buildMistakes(state.attempts, state.dismissedMistakes), state.sessions, s, day).objectiveId
  const nextTopic = OBJECTIVE_BY_ID[objectiveId]?.title
  await sb.from('reminder_prefs').upsert(
    {
      user_id: session.user.id,
      enabled: s.reminders.enabled,
      reminder_time: s.studyTime,
      days: s.studyDays,
      timezone: s.timezone,
      follow_up: s.reminders.followUp,
      follow_up_minutes: s.reminders.followUpMinutes,
      paused_until: s.reminders.pausedUntil ?? null,
      next_topic: nextTopic ?? null,
      last_completed_date: completedDates[completedDates.length - 1] ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
}
