// Pure scheduling logic for push reminders. No Deno/Node APIs, so it is unit-tested
// with Vitest (tests/reminders.test.ts) and imported by the send-reminders function.

export interface ReminderPrefs {
  enabled: boolean
  /** 'HH:MM' local time. */
  reminder_time: string
  /** 0 = Sunday … 6 = Saturday. */
  days: number[]
  timezone: string
  follow_up: boolean
  follow_up_minutes: number
  paused_until: string | null
  next_topic: string | null
  last_completed_date: string | null
  last_reminder_date: string | null
  last_followup_date: string | null
}

export interface LocalNow {
  date: string
  weekday: number
  minutes: number
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Wall-clock date/time in an IANA time zone (falls back to UTC for invalid zones). */
export function localNow(now: Date, timeZone: string): LocalNow {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
  } catch {
    return localNow(now, 'UTC')
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** If the scheduler is late by more than this, skip rather than notify at an odd hour. */
export const LATE_WINDOW_MINUTES = 90

export type ReminderKind = 'main' | 'followup'

/**
 * Decide which reminder (if any) is due for this user right now.
 * - main: on a study day, at/after the chosen time (within the late window), once per day,
 *   and only if today's session isn't already completed.
 * - followup: once per day, `follow_up_minutes` after the main reminder time, only if the
 *   main reminder went out today and the session still isn't completed.
 */
export function decideReminder(prefs: ReminderPrefs, now: Date): ReminderKind | null {
  if (!prefs.enabled) return null
  const local = localNow(now, prefs.timezone || 'UTC')
  if (prefs.paused_until && local.date <= prefs.paused_until) return null
  if (!prefs.days.includes(local.weekday)) return null
  if (prefs.last_completed_date === local.date) return null
  const at = toMinutes(prefs.reminder_time)
  if (at === null) return null

  if (prefs.last_reminder_date !== local.date) {
    if (local.minutes >= at && local.minutes < at + LATE_WINDOW_MINUTES) return 'main'
    return null
  }
  if (prefs.follow_up && prefs.last_followup_date !== local.date) {
    const followAt = at + Math.max(15, prefs.follow_up_minutes)
    if (local.minutes >= followAt && local.minutes < followAt + LATE_WINDOW_MINUTES) return 'followup'
  }
  return null
}

export function reminderPayload(kind: ReminderKind, nextTopic: string | null) {
  if (kind === 'main') {
    return {
      title: nextTopic ? `Tonight: ${nextTopic}` : 'Time for tonight’s BA session',
      body: '60 minutes: 10 recall · 25 learn · 25 practice. Tap to start.',
      url: '/session',
      tag: 'ba-reminder',
    }
  }
  return {
    title: 'Still time for tonight’s session?',
    body: nextTopic ? `${nextTopic} is waiting — even 20 minutes keeps your reviews on track.` : 'Even 20 minutes keeps your reviews on track.',
    url: '/session',
    tag: 'ba-reminder',
  }
}
