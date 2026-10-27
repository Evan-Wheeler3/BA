import { describe, expect, it } from 'vitest'
import { decideReminder, localNow, type ReminderPrefs } from '../supabase/functions/_shared/reminderLogic'

const base: ReminderPrefs = {
  enabled: true,
  reminder_time: '21:00',
  days: [1, 2, 3, 4, 5],
  timezone: 'America/New_York',
  follow_up: true,
  follow_up_minutes: 60,
  paused_until: null,
  next_topic: 'Planning UAT',
  last_completed_date: null,
  last_reminder_date: null,
  last_followup_date: null,
}

// 2026-10-27 is a Tuesday. New York is UTC-4 until Nov 1, 2026, then UTC-5.
const at = (iso: string) => new Date(iso)

describe('localNow', () => {
  it('converts to the user’s time zone including DST', () => {
    expect(localNow(at('2026-10-28T01:05:00Z'), 'America/New_York')).toEqual({ date: '2026-10-27', weekday: 2, minutes: 21 * 60 + 5 })
    expect(localNow(at('2026-11-03T02:05:00Z'), 'America/New_York')).toEqual({ date: '2026-11-02', weekday: 1, minutes: 21 * 60 + 5 })
  })
  it('falls back to UTC for an invalid zone', () => {
    expect(localNow(at('2026-10-27T10:00:00Z'), 'Not/AZone').minutes).toBe(600)
  })
})

describe('decideReminder', () => {
  it('sends the main reminder at the chosen local time on a study day', () => {
    expect(decideReminder(base, at('2026-10-28T00:59:00Z'))).toBeNull() // 20:59 local
    expect(decideReminder(base, at('2026-10-28T01:00:00Z'))).toBe('main') // 21:00 local
  })
  it('respects DST after the clocks change', () => {
    expect(decideReminder(base, at('2026-11-03T01:00:00Z'))).toBeNull() // 20:00 local after DST ends
    expect(decideReminder(base, at('2026-11-03T02:00:00Z'))).toBe('main')
  })
  it('only sends once per day', () => {
    expect(decideReminder({ ...base, last_reminder_date: '2026-10-27' }, at('2026-10-28T01:10:00Z'))).toBeNull()
  })
  it('skips non-study days, paused periods, disabled prefs and completed sessions', () => {
    expect(decideReminder(base, at('2026-11-01T01:00:00Z'))).toBeNull() // Saturday 21:00 local
    expect(decideReminder({ ...base, paused_until: '2026-10-30' }, at('2026-10-28T01:00:00Z'))).toBeNull()
    expect(decideReminder({ ...base, enabled: false }, at('2026-10-28T01:00:00Z'))).toBeNull()
    expect(decideReminder({ ...base, last_completed_date: '2026-10-27' }, at('2026-10-28T01:00:00Z'))).toBeNull()
  })
  it('does not fire hours late if the scheduler was down', () => {
    expect(decideReminder(base, at('2026-10-28T03:30:00Z'))).toBeNull() // 23:30 local
  })
  it('sends one follow-up after the configured delay if the session is not done', () => {
    const sent = { ...base, last_reminder_date: '2026-10-27' }
    expect(decideReminder(sent, at('2026-10-28T01:30:00Z'))).toBeNull()
    expect(decideReminder(sent, at('2026-10-28T02:00:00Z'))).toBe('followup')
    expect(decideReminder({ ...sent, last_followup_date: '2026-10-27' }, at('2026-10-28T02:05:00Z'))).toBeNull()
    expect(decideReminder({ ...sent, follow_up: false }, at('2026-10-28T02:00:00Z'))).toBeNull()
    expect(decideReminder({ ...sent, last_completed_date: '2026-10-27' }, at('2026-10-28T02:00:00Z'))).toBeNull()
  })
  it('rejects malformed times', () => {
    expect(decideReminder({ ...base, reminder_time: '25:99' }, at('2026-10-28T01:00:00Z'))).toBeNull()
  })
})
