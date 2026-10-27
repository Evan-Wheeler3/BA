import { useMemo } from 'react'
import { useNow } from '../ui/hooks'
import { today as todayStr, daysBetween } from '../engine/dates'
import { computeAllStats } from '../engine/mastery'
import { buildMistakes } from '../engine/mistakes'
import { buildCalendar, chooseObjective, remainingStudyDays } from '../engine/planner'
import { computeReadiness } from '../engine/readiness'
import { useAppState } from './store'

/** All derived study data, recomputed only when the underlying log or the date changes. */
export function useDerived() {
  const state = useAppState()
  const now = useNow(60_000)
  const today = todayStr(new Date(now))
  const { attempts, sessions, quizzes, settings, dismissedMistakes } = state

  const stats = useMemo(() => computeAllStats(attempts, sessions, today), [attempts, sessions, today])
  const mistakes = useMemo(() => buildMistakes(attempts, dismissedMistakes), [attempts, dismissedMistakes])
  const calendar = useMemo(() => buildCalendar(settings, sessions, quizzes, today), [settings, sessions, quizzes, today])
  const daysToTarget = daysBetween(today, settings.targetDate)
  const readiness = useMemo(
    () => computeReadiness(stats, attempts, quizzes, daysToTarget),
    [stats, attempts, quizzes, daysToTarget],
  )
  const nextTopic = useMemo(
    () => chooseObjective(stats, mistakes, sessions, settings, today),
    [stats, mistakes, sessions, settings, today],
  )
  return {
    state,
    today,
    stats,
    mistakes,
    calendar,
    readiness,
    nextTopic,
    daysToTarget,
    remainingStudyDays: remainingStudyDays(settings, today),
  }
}
