import { PASS_FRACTION } from '../domain/blueprint'
import { QUESTION_BY_ID } from '../domain/content'
import type { Attempt, Quiz } from '../domain/types'
import { isCorrect } from './grading'
import type { AllStats } from './mastery'

export interface MockResult {
  quizId: string
  kind: Quiz['kind']
  date: string
  total: number
  correct: number
  percent: number
  /** Share of questions that had never been answered before this mock. */
  freshness: number
  freshCorrect: number
  freshTotal: number
  wasPaused: boolean
}

export function scoreQuiz(quiz: Quiz): { correct: number; total: number } {
  let correct = 0
  for (const id of quiz.questionIds) {
    const q = QUESTION_BY_ID[id]
    const sel = quiz.answers[id]
    if (q && sel && isCorrect(q, sel)) correct++
  }
  return { correct, total: quiz.questionIds.length }
}

export function mockResults(quizzes: Quiz[]): MockResult[] {
  return quizzes
    .filter((q) => q.submittedAt && (q.kind === 'mock-full' || q.kind === 'mock-half' || q.kind === 'readiness'))
    .sort((a, b) => a.submittedAt! - b.submittedAt!)
    .map((quiz) => {
      const { correct, total } = scoreQuiz(quiz)
      const fresh = quiz.questionIds.filter((id) => !quiz.seenBefore.includes(id))
      const freshCorrect = fresh.filter((id) => {
        const q = QUESTION_BY_ID[id]
        const sel = quiz.answers[id]
        return q && sel && isCorrect(q, sel)
      }).length
      return {
        quizId: quiz.id,
        kind: quiz.kind,
        date: quiz.date,
        total,
        correct,
        percent: total ? correct / total : 0,
        freshness: total ? fresh.length / total : 0,
        freshCorrect,
        freshTotal: fresh.length,
        wasPaused: quiz.wasPaused,
      }
    })
}

export type ReadinessStatus = 'not-enough-evidence' | 'not-ready' | 'borderline' | 'ready'

export interface Readiness {
  status: ReadinessStatus
  headline: string
  rawPracticePercent: number | null
  rawPracticeCount: number
  weightedStudyScore: number
  freshMockQuestions: number
  freshMockAccuracy: number | null
  latestMock: MockResult | null
  checks: { label: string; ok: boolean; detail: string }[]
  /** Honest recommendation text. */
  recommendation: string
}

export const READY_TARGET = 0.8

/**
 * Readiness is deliberately conservative. "Ready to book" requires ALL of:
 *  - ≥ 60 fresh (never-seen) mock questions answered with ≥ 80% accuracy
 *  - most recent mock ≥ 80%
 *  - weighted study score ≥ 80%
 *  - every section estimate ≥ 70%
 *  - every objective taught at least once
 * "Borderline" = fresh mock accuracy ≥ 72% and weighted score ≥ 72%, but not all checks pass.
 * None of this predicts an actual Salesforce score.
 */
export function computeReadiness(stats: AllStats, attempts: Attempt[], quizzes: Quiz[], daysToTarget: number): Readiness {
  const practice = attempts.filter((a) => a.kind === 'mcq').slice(-100)
  const rawPracticePercent = practice.length ? practice.reduce((s, a) => s + a.score, 0) / practice.length : null
  const mocks = mockResults(quizzes)
  const freshTotal = mocks.reduce((s, m) => s + m.freshTotal, 0)
  const freshCorrect = mocks.reduce((s, m) => s + m.freshCorrect, 0)
  const freshAcc = freshTotal ? freshCorrect / freshTotal : null
  const latest = mocks.length ? mocks[mocks.length - 1] : null
  const minSection = Math.min(...stats.sections.map((s) => s.estimate))
  const weakestSection = stats.sections.reduce((a, b) => (a.estimate < b.estimate ? a : b))
  const untaught = stats.objectives.filter((o) => o.lessonsCompleted === 0)

  const checks = [
    {
      label: '≥ 60 fresh mock questions at ≥ 80%',
      ok: freshTotal >= 60 && (freshAcc ?? 0) >= READY_TARGET,
      detail: freshTotal
        ? `${freshTotal} fresh mock questions, ${Math.round((freshAcc ?? 0) * 100)}% correct`
        : 'No mock exam taken yet',
    },
    {
      label: 'Most recent mock ≥ 80%',
      ok: !!latest && latest.percent >= READY_TARGET,
      detail: latest ? `${Math.round(latest.percent * 100)}% on ${latest.date} (${Math.round(latest.freshness * 100)}% fresh)` : 'No mock yet',
    },
    {
      label: 'Weighted study score ≥ 80%',
      ok: stats.weightedStudyScore >= READY_TARGET,
      detail: `${Math.round(stats.weightedStudyScore * 100)}%`,
    },
    {
      label: 'Every section ≥ 70%',
      ok: minSection >= 0.7,
      detail: `Lowest: ${weakestSection.name} ${Math.round(weakestSection.estimate * 100)}%`,
    },
    {
      label: 'Every objective studied at least once',
      ok: untaught.length === 0,
      detail: untaught.length ? `${untaught.length} objective(s) not yet taught` : 'All objectives covered',
    },
  ]

  let status: ReadinessStatus
  if (!practice.length) status = 'not-enough-evidence'
  else if (checks.every((c) => c.ok)) status = 'ready'
  else if ((freshAcc ?? 0) >= PASS_FRACTION && stats.weightedStudyScore >= PASS_FRACTION) status = 'borderline'
  else if (freshTotal === 0 && practice.length < 40) status = 'not-enough-evidence'
  else status = 'not-ready'

  const headline = {
    'not-enough-evidence': 'Not enough evidence yet',
    'not-ready': 'Not ready yet',
    borderline: 'Borderline — keep going',
    ready: 'Ready to book the exam',
  }[status]

  let recommendation: string
  if (status === 'ready') {
    recommendation =
      'Your practice evidence meets every readiness check. Book the exam, keep doing short recall sessions until exam day, and avoid cramming new material.'
  } else if (daysToTarget <= 3) {
    recommendation =
      status === 'borderline'
        ? 'You are close but not consistently at 80% on fresh mock questions. Honest advice: if you can move the exam by a week or two without penalty, do it and keep running weak-area sessions. If you sit on the target date, the result is uncertain.'
        : 'Your evidence is below the readiness threshold. Honest advice: reschedule the exam (check Salesforce’s rescheduling rules first) rather than sitting on the target date, and keep the nightly routine on your weakest sections.'
  } else if (status === 'not-enough-evidence') {
    recommendation = 'Complete the diagnostic and a few sessions so the app can estimate readiness. Mock exams are scheduled for the week of November 16.'
  } else {
    recommendation = `Keep following the plan. Biggest lever right now: ${weakestSection.name} (${Math.round(weakestSection.estimate * 100)}% estimated, ${Math.round(weakestSection.weight * 100)}% of the exam).`
  }

  return {
    status,
    headline,
    rawPracticePercent,
    rawPracticeCount: practice.length,
    weightedStudyScore: stats.weightedStudyScore,
    freshMockQuestions: freshTotal,
    freshMockAccuracy: freshAcc,
    latestMock: latest,
    checks,
    recommendation,
  }
}
