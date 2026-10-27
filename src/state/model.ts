import { PROFILE } from '../domain/blueprint'
import type { AppState, Quiz, Settings, StudySession } from '../domain/types'

export const STORAGE_KEY = 'ba-coach:v1'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function defaultSettings(): Settings {
  return {
    studyDays: [1, 2, 3, 4, 5],
    studyTime: '21:00',
    targetDate: PROFILE.defaultTargetDate,
    stageMinutes: { recall: 10, learn: 25, practice: 25 },
    theme: 'system',
    reminders: { enabled: false, followUp: true, followUpMinutes: 60 },
    aiGrading: false,
    timezone: defaultTimezone(),
  }
}

export function defaultState(): AppState {
  return {
    schemaVersion: 1,
    deviceId: uid(),
    updatedAt: Date.now(),
    settings: defaultSettings(),
    settingsUpdatedAt: 0,
    attempts: [],
    sessions: [],
    quizzes: [],
    notes: {},
    dismissedMistakes: [],
  }
}

/** Fill in any fields missing from older or partial saved data. */
export function normaliseState(raw: unknown): AppState {
  const base = defaultState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<AppState>
  const settings = { ...base.settings, ...(r.settings ?? {}) }
  settings.reminders = { ...base.settings.reminders, ...(r.settings?.reminders ?? {}) }
  settings.stageMinutes = { ...base.settings.stageMinutes, ...(r.settings?.stageMinutes ?? {}) }
  return {
    schemaVersion: 1,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : base.deviceId,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : base.updatedAt,
    settings,
    settingsUpdatedAt: typeof r.settingsUpdatedAt === 'number' ? r.settingsUpdatedAt : 0,
    attempts: Array.isArray(r.attempts) ? r.attempts : [],
    sessions: Array.isArray(r.sessions) ? r.sessions : [],
    quizzes: Array.isArray(r.quizzes) ? r.quizzes : [],
    notes: r.notes && typeof r.notes === 'object' ? r.notes : {},
    dismissedMistakes: Array.isArray(r.dismissedMistakes) ? r.dismissedMistakes : [],
  }
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of [...a, ...b]) {
    const existing = map.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) map.set(item.id, item)
  }
  return [...map.values()]
}

/**
 * Conflict-free merge used for cloud sync. Attempts are an append-only log (union by
 * id); sessions/quizzes take the most recently updated copy; settings take the most
 * recently changed copy; notes and dismissals are unioned. Mastery, schedules and the
 * mistake notebook are always recomputed from this data, so they never conflict.
 */
export function mergeStates(local: AppState, remote: AppState): AppState {
  const attempts = new Map(local.attempts.map((a) => [a.id, a]))
  for (const a of remote.attempts) if (!attempts.has(a.id)) attempts.set(a.id, a)
  const useRemoteSettings = remote.settingsUpdatedAt > local.settingsUpdatedAt
  return {
    schemaVersion: 1,
    deviceId: local.deviceId,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    settings: useRemoteSettings ? remote.settings : local.settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
    attempts: [...attempts.values()].sort((a, b) => a.ts - b.ts),
    sessions: mergeById<StudySession>(local.sessions, remote.sessions),
    quizzes: mergeById<Quiz>(local.quizzes, remote.quizzes),
    notes: { ...remote.notes, ...local.notes },
    dismissedMistakes: [...new Set([...local.dismissedMistakes, ...remote.dismissedMistakes])],
  }
}
