import type { StageTimer } from '../domain/types'

// Timers are stored as timestamps, never as ticking counters, so elapsed time is
// correct after the app is backgrounded, the phone is locked, or the page reloads.
// A UI interval only re-renders; it never accumulates time itself.

export function newTimer(): StageTimer {
  return { accumulatedMs: 0 }
}

export function elapsed(timer: StageTimer, now: number = Date.now()): number {
  return timer.accumulatedMs + (timer.runningSince !== undefined ? Math.max(0, now - timer.runningSince) : 0)
}

export function start(timer: StageTimer, now: number = Date.now()): StageTimer {
  if (timer.runningSince !== undefined) return timer
  return { ...timer, runningSince: now }
}

export function pause(timer: StageTimer, now: number = Date.now()): StageTimer {
  if (timer.runningSince === undefined) return timer
  return { accumulatedMs: elapsed(timer, now) }
}

export function isRunning(timer: StageTimer): boolean {
  return timer.runningSince !== undefined
}

/**
 * Cap an absurd running segment (e.g., a session left "running" overnight) so stats
 * stay meaningful. Applied when resuming an old session.
 */
export function capIdle(timer: StageTimer, maxSegmentMs: number, now: number = Date.now()): StageTimer {
  if (timer.runningSince === undefined) return timer
  const segment = now - timer.runningSince
  if (segment <= maxSegmentMs) return timer
  return { accumulatedMs: timer.accumulatedMs + maxSegmentMs }
}

export function remaining(timer: StageTimer, limitMs: number, now: number = Date.now()): number {
  return limitMs - elapsed(timer, now)
}
