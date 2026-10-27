import { useSyncExternalStore } from 'react'
import type { AppState } from '../domain/types'
import { STORAGE_KEY, defaultState, normaliseState } from './model'

type Listener = () => void

let state: AppState = load()
const listeners = new Set<Listener>()
let storageError: string | null = null
const changeHooks = new Set<(s: AppState) => void>()

function load(): AppState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return raw ? normaliseState(JSON.parse(raw)) : defaultState()
  } catch {
    return defaultState()
  }
}

function persist(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    storageError = null
  } catch (e) {
    storageError =
      e instanceof Error && e.name === 'QuotaExceededError'
        ? 'Device storage is full — export your data from Settings.'
        : 'Progress could not be saved on this device (private browsing or storage blocked).'
  }
}

export function getState(): AppState {
  return state
}

export function getStorageError(): string | null {
  return storageError
}

export function setState(updater: (s: AppState) => AppState, opts: { silent?: boolean } = {}) {
  const next = updater(state)
  if (next === state) return
  state = { ...next, updatedAt: Date.now() }
  persist(state)
  listeners.forEach((l) => l())
  if (!opts.silent) changeHooks.forEach((h) => h(state))
}

/** Replace state wholesale (import, cloud merge, reset). */
export function replaceState(next: AppState, opts: { silent?: boolean } = {}) {
  state = next
  persist(state)
  listeners.forEach((l) => l())
  if (!opts.silent) changeHooks.forEach((h) => h(state))
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Register a callback for user-initiated changes (used by cloud sync). */
export function onChange(hook: (s: AppState) => void) {
  changeHooks.add(hook)
  return () => changeHooks.delete(hook)
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

// Keep tabs in sync when the same app is open twice.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        state = normaliseState(JSON.parse(e.newValue))
        listeners.forEach((l) => l())
      } catch {
        /* ignore malformed */
      }
    }
  })
}

/** Test helper. */
export function __resetForTests(s: AppState = defaultState()) {
  state = s
  listeners.clear()
  changeHooks.clear()
}
