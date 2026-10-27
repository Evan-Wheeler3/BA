import { OBJECTIVES, SECTIONS, objectiveWeight, objectivesForSection } from '../domain/blueprint'
import { QUESTION_BY_ID } from '../domain/content'
import type { Attempt, Confidence, Objective, SectionId, StudySession } from '../domain/types'
import { addDays, daysBetween } from './dates'

/**
 * Mastery model (study-management thresholds — NOT predictions of exam score):
 *   New                  no evidence yet
 *   Learning             < 60%
 *   Developing           60–74%
 *   Nearly ready         75–84%
 *   Strong               85–94% (or ≥95% without the evidence below)
 *   Demonstrated mastery ≥95% across ≥10 distinct questions/prompts, including a
 *                        correct delayed review (≥3 days after first practice)
 *
 * Mastery % is a recency-weighted average of the last 20 results for an objective
 * (most recent weight 1, each older result × 0.88), so improvement shows quickly
 * but one lucky answer does not.
 *
 * The "estimate" used for prioritisation blends that evidence with a prior from the
 * previous exam: section baseline × 0.9 (≈ two months without study), counted as
 * 3 results' worth of evidence. Once you have ~10 results, your own evidence dominates.
 */
export type MasteryLevel = 'New' | 'Learning' | 'Developing' | 'Nearly ready' | 'Strong' | 'Demonstrated mastery'

export const LEVEL_ORDER: MasteryLevel[] = ['New', 'Learning', 'Developing', 'Nearly ready', 'Strong', 'Demonstrated mastery']

const RECENT_WINDOW = 20
const DECAY = 0.88
const PRIOR_WEIGHT = 3
const RETENTION_DISCOUNT = 0.9
const MAX_INTERVAL_DAYS = 14

export interface SrsState {
  intervalDays: number
  ease: number
  reps: number
  lastDate: string | null
  nextReview: string | null
}

export interface ObjectiveStats {
  objective: Objective
  weight: number
  baseline: number
  attempts: number
  distinctItems: number
  accuracy: number | null
  mastery: number | null
  estimate: number
  level: MasteryLevel
  lastResult: number | null
  lastStudied: string | null
  lessonsCompleted: number
  lastLessonDate: string | null
  srs: SrsState
  due: boolean
  avgConfidence: number | null
  /** High-confidence answers that were wrong — likely misconceptions. */
  confidentErrors: number
  errorsLast14Days: number
  commonMistakes: string[]
  delayedReviewOk: boolean
}

export interface SectionStats {
  sectionId: SectionId
  name: string
  weight: number
  baseline: number
  attempts: number
  mastery: number | null
  estimate: number
  level: MasteryLevel
  objectives: ObjectiveStats[]
}

export function levelFor(mastery: number | null, distinctItems: number, delayedReviewOk: boolean): MasteryLevel {
  if (mastery === null) return 'New'
  if (mastery >= 0.95) return distinctItems >= 10 && delayedReviewOk ? 'Demonstrated mastery' : 'Strong'
  if (mastery >= 0.85) return 'Strong'
  if (mastery >= 0.75) return 'Nearly ready'
  if (mastery >= 0.6) return 'Developing'
  return 'Learning'
}

const CONF_VALUE: Record<Confidence, number> = { low: 1 / 3, med: 2 / 3, high: 1 }

/** Replay daily results through a small SM-2-style scheduler. */
export function replaySrs(dailyScores: { date: string; score: number }[]): SrsState {
  let state: SrsState = { intervalDays: 0, ease: 2.3, reps: 0, lastDate: null, nextReview: null }
  for (const { date, score } of dailyScores) {
    let { intervalDays, ease, reps } = state
    if (score >= 0.8) {
      reps += 1
      intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(Math.max(intervalDays, 1) * ease)
      ease = Math.min(2.8, ease + 0.1)
    } else if (score >= 0.6) {
      // Partial recall: hold roughly steady, never longer than a few days.
      intervalDays = Math.max(1, Math.min(3, Math.round(intervalDays * 1.2)))
    } else {
      reps = 0
      intervalDays = 1
      ease = Math.max(1.3, ease - 0.2)
    }
    intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS)
    state = { intervalDays, ease, reps, lastDate: date, nextReview: addDays(date, intervalDays) }
  }
  return state
}

function groupDaily(attempts: Attempt[]): { date: string; score: number }[] {
  const byDate = new Map<string, number[]>()
  for (const a of attempts) {
    const list = byDate.get(a.date) ?? []
    list.push(a.score)
    byDate.set(a.date, list)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, scores]) => ({ date, score: scores.reduce((s, x) => s + x, 0) / scores.length }))
}

export function recencyWeighted(scores: number[]): number | null {
  // scores ordered oldest → newest
  const recent = scores.slice(-RECENT_WINDOW)
  if (!recent.length) return null
  let num = 0
  let den = 0
  for (let i = recent.length - 1, k = 0; i >= 0; i--, k++) {
    const w = DECAY ** k
    num += w * recent[i]
    den += w
  }
  return num / den
}

export function sectionBaseline(sectionId: SectionId): number {
  const s = SECTIONS.find((x) => x.id === sectionId)!
  return s.baseline.correct / s.baseline.total
}

export function computeObjectiveStats(
  objective: Objective,
  attempts: Attempt[],
  sessions: StudySession[],
  today: string,
): ObjectiveStats {
  const mine = attempts.filter((a) => a.objectiveId === objective.id).sort((a, b) => a.ts - b.ts)
  const baseline = sectionBaseline(objective.sectionId)
  const scores = mine.map((a) => a.score)
  const mastery = recencyWeighted(scores)
  const nEff = Math.min(scores.length, RECENT_WINDOW)
  const prior = baseline * RETENTION_DISCOUNT
  const estimate = mastery === null ? prior : (prior * PRIOR_WEIGHT + mastery * nEff) / (PRIOR_WEIGHT + nEff)

  const firstDate = mine[0]?.date ?? null
  const delayedReviewOk = firstDate
    ? mine.some((a) => a.score >= 0.75 && daysBetween(firstDate, a.date) >= 3)
    : false
  const distinctItems = new Set(mine.map((a) => a.itemId)).size

  const lessons = sessions
    .filter((s) => s.objectiveId === objective.id && (s.stage === 'practice' || s.stage === 'summary' || s.completedAt))
    .map((s) => s.date)
    .sort()
  const lastLessonDate = lessons.length ? lessons[lessons.length - 1] : null

  let srs = replaySrs(groupDaily(mine))
  if (srs.nextReview === null && lastLessonDate) {
    srs = { ...srs, lastDate: lastLessonDate, nextReview: addDays(lastLessonDate, 1), intervalDays: 1 }
  }
  const lastAttemptDate = mine.length ? mine[mine.length - 1].date : null
  const lastStudied = [lastAttemptDate, lastLessonDate].filter(Boolean).sort().pop() ?? null

  const withConf = mine.filter((a) => a.confidence)
  const avgConfidence = withConf.length
    ? withConf.reduce((s, a) => s + CONF_VALUE[a.confidence!], 0) / withConf.length
    : null
  const confidentErrors = mine.filter((a) => a.confidence === 'high' && a.score < 0.5).length

  const since = addDays(today, -14)
  const errorsLast14Days = mine.filter((a) => a.score < 0.75 && a.date >= since).length

  const tagCounts = new Map<string, number>()
  for (const a of mine) {
    if (a.score >= 0.75 || a.kind !== 'mcq') continue
    for (const t of QUESTION_BY_ID[a.itemId]?.tags ?? []) {
      if (t === 'multi-select') continue
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }
  const commonMistakes = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)

  return {
    objective,
    weight: objectiveWeight(objective.id),
    baseline,
    attempts: mine.length,
    distinctItems,
    accuracy: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null,
    mastery,
    estimate,
    level: levelFor(mastery, distinctItems, delayedReviewOk),
    lastResult: scores.length ? scores[scores.length - 1] : null,
    lastStudied,
    lessonsCompleted: lessons.length,
    lastLessonDate,
    srs,
    due: srs.nextReview !== null && srs.nextReview <= today,
    avgConfidence,
    confidentErrors,
    errorsLast14Days,
    commonMistakes,
    delayedReviewOk,
  }
}

export function computeAllStats(attempts: Attempt[], sessions: StudySession[], today: string) {
  const objectives = OBJECTIVES.map((o) => computeObjectiveStats(o, attempts, sessions, today))
  const byId: Record<string, ObjectiveStats> = Object.fromEntries(objectives.map((s) => [s.objective.id, s]))
  const sections: SectionStats[] = SECTIONS.map((sec) => {
    const objs = objectivesForSection(sec.id).map((o) => byId[o.id])
    const withEvidence = objs.filter((o) => o.mastery !== null)
    const attemptsCount = objs.reduce((s, o) => s + o.attempts, 0)
    const mastery = withEvidence.length
      ? withEvidence.reduce((s, o) => s + o.mastery! * o.attempts, 0) /
        withEvidence.reduce((s, o) => s + o.attempts, 0)
      : null
    const estimate = objs.reduce((s, o) => s + o.estimate, 0) / objs.length
    const minDistinct = Math.min(...objs.map((o) => o.distinctItems))
    const allDelayed = objs.every((o) => o.delayedReviewOk)
    return {
      sectionId: sec.id,
      name: sec.name,
      weight: sec.weight,
      baseline: sectionBaseline(sec.id),
      attempts: attemptsCount,
      mastery,
      estimate,
      level: levelFor(mastery, minDistinct, allDelayed),
      objectives: objs,
    }
  })
  const weightedStudyScore = sections.reduce((s, sec) => s + sec.weight * sec.estimate, 0)
  return { objectives, byId, sections, weightedStudyScore }
}

export type AllStats = ReturnType<typeof computeAllStats>
