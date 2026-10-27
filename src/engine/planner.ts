import { OBJECTIVES, OBJECTIVE_BY_ID, PROFILE, SECTION_BY_ID } from '../domain/blueprint'
import type { Quiz, Settings, StudySession } from '../domain/types'
import { addDays, dateRange, daysBetween, weekday } from './dates'
import type { AllStats, ObjectiveStats } from './mastery'
import type { MistakeEntry } from './mistakes'

// ---------------- Calendar ----------------

export type DayKind = 'diagnostic-learn' | 'learn' | 'mixed' | 'mock-half' | 'remediation' | 'readiness' | 'exam' | 'optional-mock'

export interface PlanTemplateDay {
  date: string
  phase: string
  title: string
  kind: DayKind
  objectives: string[]
}

export const PHASES = [
  { id: 'P1', name: 'Phase 1 — Rebuild the weakest foundations', start: '2026-10-27', end: '2026-10-30' },
  { id: 'P2', name: 'Phase 2 — High-weight stakeholder skills', start: '2026-11-02', end: '2026-11-06' },
  { id: 'P3', name: 'Phase 3 — Requirements and integration', start: '2026-11-09', end: '2026-11-13' },
  { id: 'P4', name: 'Phase 4 — Exam readiness', start: '2026-11-16', end: '2026-11-22' },
  { id: 'P5', name: 'Final review', start: '2026-11-23', end: '2026-11-24' },
]

/** Initial allocation from the study brief. The planner adapts within it. */
export const PLAN_TEMPLATE: PlanTemplateDay[] = [
  { date: '2026-10-27', phase: 'P1', kind: 'diagnostic-learn', title: 'Diagnostic + process scoping', objectives: ['BPM1'] },
  { date: '2026-10-28', phase: 'P1', kind: 'learn', title: 'Process mapping: UPN, as-is and to-be', objectives: ['BPM2'] },
  { date: '2026-10-29', phase: 'P1', kind: 'learn', title: 'Planning UAT and supporting delivery', objectives: ['UA2', 'UA1'] },
  { date: '2026-10-30', phase: 'P1', kind: 'learn', title: 'UAT results, go/no-go and process governance', objectives: ['UA3', 'UA4', 'BPM3'] },
  { date: '2026-11-02', phase: 'P2', kind: 'learn', title: 'Choosing elicitation techniques', objectives: ['CS1'] },
  { date: '2026-11-03', phase: 'P2', kind: 'learn', title: 'Stakeholder identification and analysis', objectives: ['CS2'] },
  { date: '2026-11-04', phase: 'P2', kind: 'learn', title: 'Competing priorities and conflict', objectives: ['CS4'] },
  { date: '2026-11-05', phase: 'P2', kind: 'learn', title: 'Current state to agreed future state', objectives: ['CS3'] },
  { date: '2026-11-06', phase: 'P2', kind: 'learn', title: 'Customer discovery refresh', objectives: ['CD1', 'CD2', 'CD3'] },
  { date: '2026-11-09', phase: 'P3', kind: 'learn', title: 'Scope vs requirements vs user stories', objectives: ['RQ1'] },
  { date: '2026-11-10', phase: 'P3', kind: 'learn', title: 'Identify, validate and prioritise requirements', objectives: ['RQ2'] },
  { date: '2026-11-11', phase: 'P3', kind: 'learn', title: 'Traceability and version control', objectives: ['RQ3'] },
  { date: '2026-11-12', phase: 'P3', kind: 'learn', title: 'User stories, AC vs DoD, backlog', objectives: ['US1', 'US2', 'US3'] },
  { date: '2026-11-13', phase: 'P3', kind: 'mixed', title: 'Mixed integration: requirements ↔ stakeholders ↔ process ↔ testing', objectives: [] },
  { date: '2026-11-16', phase: 'P4', kind: 'mock-half', title: 'Half mock exam A (30 questions, 53 min)', objectives: [] },
  { date: '2026-11-17', phase: 'P4', kind: 'remediation', title: 'Targeted remediation of recurring mistakes', objectives: [] },
  { date: '2026-11-18', phase: 'P4', kind: 'mock-half', title: 'Half mock exam B (30 questions, 53 min)', objectives: [] },
  { date: '2026-11-19', phase: 'P4', kind: 'remediation', title: 'Remediation + timed scenario questions', objectives: [] },
  { date: '2026-11-20', phase: 'P4', kind: 'mixed', title: 'Timed mixed scenarios across all sections', objectives: [] },
  { date: '2026-11-21', phase: 'P4', kind: 'optional-mock', title: 'Optional: full 60-question mock (105 min)', objectives: [] },
  { date: '2026-11-22', phase: 'P4', kind: 'optional-mock', title: 'Optional: full 60-question mock (105 min)', objectives: [] },
  { date: '2026-11-23', phase: 'P5', kind: 'readiness', title: 'Final readiness assessment and light review', objectives: [] },
  { date: '2026-11-24', phase: 'P5', kind: 'exam', title: 'Exam day — sit only if readiness is demonstrated', objectives: [] },
]

export type DayStatus = 'done' | 'partial' | 'missed' | 'today' | 'upcoming' | 'rest'

export interface CalendarDay {
  date: string
  isStudyDay: boolean
  plan: PlanTemplateDay | null
  phaseName: string | null
  status: DayStatus
  sessionIds: string[]
  quizIds: string[]
}

export function isStudyDay(settings: Settings, date: string): boolean {
  return settings.studyDays.includes(weekday(date))
}

function templateFor(date: string, settings: Settings): PlanTemplateDay | null {
  const t = PLAN_TEMPLATE.find((d) => d.date === date)
  if (t) {
    if (t.kind === 'exam' && date !== settings.targetDate) return { ...t, kind: 'readiness', title: 'Final review' }
    return t
  }
  if (date === settings.targetDate) {
    return { date, phase: 'P5', kind: 'exam', title: 'Exam day — sit only if readiness is demonstrated', objectives: [] }
  }
  // Dates outside the template (e.g., after moving the target date): alternate mixed practice and remediation.
  return {
    date,
    phase: 'P4',
    kind: weekday(date) % 2 === 0 ? 'mixed' : 'remediation',
    title: weekday(date) % 2 === 0 ? 'Adaptive mixed practice' : 'Adaptive remediation',
    objectives: [],
  }
}

export function buildCalendar(
  settings: Settings,
  sessions: StudySession[],
  quizzes: Quiz[],
  today: string,
): CalendarDay[] {
  const start = PROFILE.startDate < today ? PROFILE.startDate : today
  const end = settings.targetDate >= start ? settings.targetDate : start
  return dateRange(start, end).map((date) => {
    const studyDay = isStudyDay(settings, date) || date === settings.targetDate
    const plan = templateFor(date, settings)
    const daySessions = sessions.filter((s) => s.date === date && !s.abandoned)
    const dayQuizzes = quizzes.filter((q) => q.date === date && q.submittedAt)
    const completed = daySessions.some((s) => s.completedAt) || dayQuizzes.some((q) => q.kind.startsWith('mock') || q.kind === 'readiness')
    const started = daySessions.length > 0 || dayQuizzes.length > 0
    let status: DayStatus
    if (completed) status = 'done'
    else if (date === today) status = studyDay ? 'today' : started ? 'partial' : 'rest'
    else if (date < today) status = started ? 'partial' : studyDay ? 'missed' : 'rest'
    else status = studyDay ? 'upcoming' : 'rest'
    const phase = plan ? PHASES.find((p) => p.id === plan.phase) : null
    return {
      date,
      isStudyDay: studyDay,
      plan: studyDay || plan?.kind === 'optional-mock' ? plan : null,
      phaseName: phase?.name ?? null,
      status,
      sessionIds: daySessions.map((s) => s.id),
      quizIds: dayQuizzes.map((q) => q.id),
    }
  })
}

export function remainingStudyDays(settings: Settings, today: string): number {
  if (settings.targetDate < today) return 0
  return dateRange(today, settings.targetDate).filter((d) => isStudyDay(settings, d)).length
}

export function nextStudyDay(settings: Settings, from: string): string | null {
  for (let i = 0; i <= 14; i++) {
    const d = addDays(from, i)
    if (isStudyDay(settings, d)) return d
  }
  return null
}

// ---------------- Topic prioritisation ----------------

export interface TopicScore {
  objectiveId: string
  score: number
  reasons: string[]
}

/**
 * Transparent priority score for choosing the primary lesson topic:
 *   weight × weakness × recency × errors × importance × calendar × due × coverage × anti-repeat
 * Every factor is listed in `reasons` so the choice can be explained in the UI.
 */
export function scoreObjectives(
  stats: AllStats,
  mistakes: MistakeEntry[],
  sessions: StudySession[],
  settings: Settings,
  today: string,
): TopicScore[] {
  const plan = templateFor(today, settings)
  const plannedObjectives = plan?.objectives ?? []
  const plannedSections = new Set(plannedObjectives.map((id) => OBJECTIVE_BY_ID[id].sectionId))
  const recentSessions = [...sessions]
    .filter((s) => !s.abandoned && s.date < today)
    .sort((a, b) => b.createdAt - a.createdAt)
  const last = recentSessions[0]?.objectiveId
  const secondLast = recentSessions[1]?.objectiveId
  const uncovered = stats.objectives.filter((o) => o.lessonsCompleted === 0).length
  const remaining = remainingStudyDays(settings, today)
  // Start protecting coverage early enough that every objective gets a lesson before the target date.
  const coveragePressure = uncovered > 0 && remaining <= uncovered + 5

  return stats.objectives
    .map((o) => {
      const reasons: string[] = []
      const id = o.objective.id
      const section = SECTION_BY_ID[o.objective.sectionId]
      const weightFactor = o.weight * OBJECTIVES.length
      const weakness = Math.max(0.05, 1 - o.estimate)
      reasons.push(`${Math.round(section.weight * 100)}% section weight`)
      reasons.push(`estimated ${Math.round(o.estimate * 100)}% (${o.attempts ? `${o.attempts} results` : 'baseline only'})`)

      let recency = 1.5
      if (o.lastLessonDate) recency = Math.min(1.5, 0.6 + daysBetween(o.lastLessonDate, today) / 7)
      else reasons.push('not yet taught in a session')

      const unresolved = mistakes.filter((m) => m.objectiveId === id && !m.resolved).length
      const errors = 1 + Math.min(1, 0.15 * unresolved)
      if (unresolved) reasons.push(`${unresolved} open mistake${unresolved > 1 ? 's' : ''}`)

      const importance = 1 + 0.08 * o.objective.dependents

      let calendar = 1
      if (plannedObjectives.includes(id)) {
        calendar = 2.2
        reasons.push('on today’s study calendar')
      } else if (plannedSections.has(o.objective.sectionId)) calendar = 1.3

      const due = o.due ? 1.15 : 1
      if (o.due) reasons.push('spaced review due')

      let coverage = 1
      if (coveragePressure && o.lessonsCompleted === 0) {
        coverage = 3
        reasons.push('must be covered before the exam date')
      }

      let antiRepeat = 1
      if (id === last) {
        antiRepeat = 0.3
        reasons.push('studied last session (deprioritised to keep coverage broad)')
      } else if (id === secondLast) antiRepeat = 0.6

      if (o.confidentErrors > 0) reasons.push(`${o.confidentErrors} confident wrong answer${o.confidentErrors > 1 ? 's' : ''}`)

      const score = weightFactor * weakness * recency * errors * importance * calendar * due * coverage * antiRepeat
      return { objectiveId: id, score, reasons }
    })
    .sort((a, b) => b.score - a.score)
}

export function chooseObjective(
  stats: AllStats,
  mistakes: MistakeEntry[],
  sessions: StudySession[],
  settings: Settings,
  today: string,
): TopicScore {
  return scoreObjectives(stats, mistakes, sessions, settings, today)[0]
}

export function weakestObjectives(stats: AllStats, n: number): ObjectiveStats[] {
  return [...stats.objectives].sort((a, b) => a.estimate - b.estimate).slice(0, n)
}
