import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState } from '../domain/types'
import { mergeStates, normaliseState } from '../state/model'
import { getState, onChange, replaceState } from '../state/store'
import { supabase } from './supabase'

export type SyncStatus = 'not-configured' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

interface SyncInfo {
  status: SyncStatus
  email: string | null
  lastSyncedAt: number | null
  error: string | null
}

let info: SyncInfo = { status: supabase() ? 'signed-out' : 'not-configured', email: null, lastSyncedAt: null, error: null }
const listeners = new Set<() => void>()
const authListeners = new Set<(s: Session | null) => void>()
let session: Session | null = null
let pushTimer: number | undefined
let started = false

function set(patch: Partial<SyncInfo>) {
  info = { ...info, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => info,
  )
}

export function currentSession(): Session | null {
  return session
}

export function onAuth(fn: (s: Session | null) => void) {
  authListeners.add(fn)
  return () => authListeners.delete(fn)
}

/** Pull remote state, merge with local, write back both places. */
export async function syncNow(): Promise<void> {
  const sb = supabase()
  if (!sb || !session) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    set({ status: 'offline' })
    return
  }
  set({ status: 'syncing', error: null })
  try {
    const { data, error } = await sb.from('study_state').select('state').eq('user_id', session.user.id).maybeSingle()
    if (error) throw error
    const local = getState()
    const merged = data?.state ? mergeStates(local, normaliseState(data.state)) : local
    if (merged !== local) replaceState(merged, { silent: true })
    await push(merged)
    set({ status: 'synced', lastSyncedAt: Date.now() })
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed' })
  }
}

async function push(state: AppState) {
  const sb = supabase()
  if (!sb || !session) return
  const { error } = await sb
    .from('study_state')
    .upsert({ user_id: session.user.id, state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

function schedulePush() {
  if (!session) return
  window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(async () => {
    try {
      set({ status: 'syncing' })
      await push(getState())
      set({ status: 'synced', lastSyncedAt: Date.now(), error: null })
    } catch (e) {
      set({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : 'Sync failed' })
    }
  }, 2500)
}

export function startSync() {
  const sb = supabase()
  if (!sb || started) return
  started = true
  sb.auth.getSession().then(({ data }) => handleSession(data.session))
  sb.auth.onAuthStateChange((_event, s) => handleSession(s))
  onChange(() => schedulePush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  window.addEventListener('online', () => void syncNow())
}

function handleSession(s: Session | null) {
  const changed = s?.user.id !== session?.user.id
  session = s
  set({ email: s?.user.email ?? null, status: s ? info.status : 'signed-out' })
  authListeners.forEach((fn) => fn(s))
  if (s && changed) void syncNow()
}

export async function signInWithEmail(email: string): Promise<{ ok: boolean; message: string }> {
  const sb = supabase()
  if (!sb) return { ok: false, message: 'Cloud sync is not configured for this deployment.' }
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/settings` },
  })
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: `Check ${email} for a sign-in link. Open it on this device.` }
}

export async function signOut() {
  await supabase()?.auth.signOut()
  set({ status: 'signed-out', lastSyncedAt: null })
}

/** Delete all cloud data for the signed-in user (study state, reminders, subscriptions). */
export async function deleteCloudData(): Promise<{ ok: boolean; message: string }> {
  const sb = supabase()
  if (!sb || !session) return { ok: false, message: 'Not signed in.' }
  const uid = session.user.id
  const results = await Promise.all([
    sb.from('study_state').delete().eq('user_id', uid),
    sb.from('push_subscriptions').delete().eq('user_id', uid),
    sb.from('reminder_prefs').delete().eq('user_id', uid),
  ])
  const err = results.find((r) => r.error)?.error
  if (err) return { ok: false, message: err.message }
  return { ok: true, message: 'Cloud data deleted.' }
}
