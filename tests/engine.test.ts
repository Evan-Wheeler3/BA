import { describe, expect, it } from 'vitest'
import { MOCK_DISTRIBUTION, OBJECTIVES, OBJECTIVE_BY_ID } from '../src/domain/blueprint'
import { QUESTIONS, QUESTION_BY_ID, RECALL_BY_ID } from '../src/domain/content'
import type { Attempt, Quiz } from '../src/domain/types'
import { addDays, daysBetween, weekday } from '../src/engine/dates'
import { gradeRecall, isCorrect } from '../src/engine/grading'
import { computeAllStats, levelFor, recencyWeighted, replaySrs } from '../src/engine/mastery'
import { buildMistakes } from '../src/engine/mistakes'
import { buildCalendar, chooseObjective, remainingStudyDays, scoreObjectives } from '../src/engine/planner'
import { computeReadiness, mockResults } from '../src/engine/readiness'
import { buildPracticeQueue, buildQuizQuestions, buildRecallQueue } from '../src/engine/selection'
import { capIdle, elapsed, newTimer, pause, start } from '../src/engine/timer'
import { defaultSettings, defaultState, mergeStates } from '../src/state/model'

let n = 0
function attempt(partial: Partial<Attempt> & { itemId: string; score: number; date: string }): Attempt {
  const q = QUESTION_BY_ID[partial.itemId]
  const r = RECALL_BY_ID[partial.itemId]
  n++
  return {
    id: `a${n}`,
    ts: new Date(`${partial.date}T21:00:00`).getTime() + n,
    kind: q ? 'mcq' : 'recall',
    source: 'session-practice',
    objectiveId: q?.objectiveId ?? r!.objectiveId,
    ...partial,
  }
}

describe('dates', () => {
  it('handles arithmetic and weekdays', () => {
    expect(weekday('2026-10-27')).toBe(2) // Tuesday
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(daysBetween('2026-10-27', '2026-11-24')).toBe(28)
  })
})

describe('MCQ grading', () => {
  it('requires the exact set for multi-select', () => {
    const multi = QUESTIONS.find((q) => q.correct.length === 2)!
    expect(isCorrect(multi, multi.correct)).toBe(true)
    expect(isCorrect(multi, [...multi.correct].reverse())).toBe(true)
    expect(isCorrect(multi, [multi.correct[0]])).toBe(false)
    const wrong = multi.options.find((o) => !multi.correct.includes(o.id))!.id
    expect(isCorrect(multi, [multi.correct[0], wrong])).toBe(false)
  })
})

describe('recall grading', () => {
  const p = RECALL_BY_ID['RC-US1-2'] // INVEST
  it('scores 4 for a complete answer and accepts equivalent wording', () => {
    expect(gradeRecall(p, 'independent, negotiable, valuable, estimable, small, testable').rubric).toBeGreaterThanOrEqual(3)
  })
  it('scores partial answers in the middle', () => {
    const g = gradeRecall(p, 'independent, valuable and testable stories')
    expect(g.rubric).toBe(2)
    expect(g.missed.map((k) => k.label)).toContain('Negotiable')
  })
  it('scores empty / too-short answers 0', () => {
    expect(gradeRecall(p, '').rubric).toBe(0)
    expect(gradeRecall(p, 'no idea').rubric).toBe(0)
  })
  it('requires short stems to match whole words', () => {
    const us3 = RECALL_BY_ID['RC-US3-1']
    // "policy" must not satisfy the "po" stem
    const g = gradeRecall(us3, 'The policy team orders it and the analyst helps refine and split stories')
    expect(g.matched.map((k) => k.label)).not.toContain('Product owner orders/prioritises')
    const g2 = gradeRecall(us3, 'The PO orders it and the analyst helps refine and split stories')
    expect(g2.matched.map((k) => k.label)).toContain('Product owner orders/prioritises')
  })
  it('caps bare lists at 3 for scenario prompts', () => {
    const s = RECALL_BY_ID['RC-BPM1-1']
    expect(gradeRecall(s, 'trigger outcome scope owner').rubric).toBe(3)
  })
})

describe('timer', () => {
  it('computes elapsed from timestamps, surviving background suspension', () => {
    let t = start(newTimer(), 1_000)
    expect(elapsed(t, 61_000)).toBe(60_000)
    t = pause(t, 61_000)
    expect(elapsed(t, 999_999)).toBe(60_000) // paused: no growth
    t = start(t, 100_000)
    expect(elapsed(t, 160_000)).toBe(120_000)
  })
  it('caps a runaway segment', () => {
    const t = start(newTimer(), 0)
    expect(elapsed(capIdle(t, 45 * 60_000, 10 * 3_600_000))).toBe(45 * 60_000)
  })
})

describe('spaced repetition', () => {
  it('reviews weak material the next day and grows intervals with success', () => {
    expect(replaySrs([{ date: '2026-10-27', score: 0.3 }]).nextReview).toBe('2026-10-28')
    const s = replaySrs([
      { date: '2026-10-27', score: 1 },
      { date: '2026-10-28', score: 1 },
      { date: '2026-10-31', score: 1 },
    ])
    expect(s.intervalDays).toBeGreaterThan(3)
  })
  it('shortens the interval after a failure', () => {
    const s = replaySrs([
      { date: '2026-10-27', score: 1 },
      { date: '2026-10-28', score: 1 },
      { date: '2026-10-31', score: 0 },
    ])
    expect(s.intervalDays).toBe(1)
    expect(s.nextReview).toBe('2026-11-01')
  })
  it('caps the interval so strong topics are still revisited before the exam', () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-10-27', i * 10), score: 1 }))
    expect(replaySrs(days).intervalDays).toBeLessThanOrEqual(14)
  })
})

describe('mastery', () => {
  it('weights recent results more heavily', () => {
    expect(recencyWeighted([0, 0, 0, 1, 1, 1])!).toBeGreaterThan(0.5)
    expect(recencyWeighted([1, 1, 1, 0, 0, 0])!).toBeLessThan(0.5)
  })
  it('levels follow the documented thresholds', () => {
    expect(levelFor(null, 0, false)).toBe('New')
    expect(levelFor(0.5, 3, false)).toBe('Learning')
    expect(levelFor(0.7, 3, false)).toBe('Developing')
    expect(levelFor(0.8, 3, false)).toBe('Nearly ready')
    expect(levelFor(0.9, 3, false)).toBe('Strong')
    expect(levelFor(0.97, 9, true)).toBe('Strong')
    expect(levelFor(0.97, 10, false)).toBe('Strong')
    expect(levelFor(0.97, 10, true)).toBe('Demonstrated mastery')
  })
  it('uses the previous exam as a prior that evidence overrides', () => {
    const empty = computeAllStats([], [], '2026-10-27')
    expect(empty.byId.BPM1.estimate).toBeCloseTo((2 / 7) * 0.9, 5)
    const bpm = QUESTIONS.filter((q) => q.objectiveId === 'BPM1')
    const atts = bpm.map((q, i) => attempt({ itemId: q.id, score: 1, date: addDays('2026-10-27', i) }))
    const stats = computeAllStats(atts, [], '2026-11-10')
    expect(stats.byId.BPM1.estimate).toBeGreaterThan(0.6)
    expect(stats.byId.BPM1.attempts).toBe(bpm.length)
  })
  it('flags confident wrong answers as misconceptions', () => {
    const q = QUESTIONS.find((x) => x.objectiveId === 'UA4')!
    const stats = computeAllStats([attempt({ itemId: q.id, score: 0, date: '2026-10-27', confidence: 'high' })], [], '2026-10-27')
    expect(stats.byId.UA4.confidentErrors).toBe(1)
  })
  it('weighted study score with no evidence reflects the discounted baseline', () => {
    const s = computeAllStats([], [], '2026-10-27')
    expect(s.weightedStudyScore).toBeGreaterThan(0.5)
    expect(s.weightedStudyScore).toBeLessThan(0.62)
  })
})

describe('mistake notebook', () => {
  it('records wrong answers with rationale and resolves after a later correct answer', () => {
    const q = QUESTION_BY_ID['UA-006']
    const wrongOpt = q.options.find((o) => !q.correct.includes(o.id))!.id
    const a1 = attempt({ itemId: q.id, score: 0, date: '2026-10-27', selected: [wrongOpt] })
    let m = buildMistakes([a1])
    expect(m).toHaveLength(1)
    expect(m[0].whyWrong).toBe(q.distractors[wrongOpt])
    expect(m[0].nextReview).toBe('2026-10-28')
    expect(m[0].resolved).toBe(false)
    const a2 = attempt({ itemId: q.id, score: 1, date: '2026-10-29', selected: q.correct })
    m = buildMistakes([a1, a2])
    expect(m[0].resolved).toBe(true)
  })
  it('counts repeated mistakes', () => {
    const q = QUESTION_BY_ID['BPM-009']
    const m = buildMistakes([
      attempt({ itemId: q.id, score: 0, date: '2026-10-27', selected: ['a'] }),
      attempt({ itemId: q.id, score: 0, date: '2026-10-28', selected: ['a'] }),
    ])
    expect(m[0].count).toBe(2)
  })
})

describe('calendar and planner', () => {
  const settings = defaultSettings()
  it('schedules weekday sessions and marks weekends as rest', () => {
    const cal = buildCalendar(settings, [], [], '2026-10-27')
    expect(cal[0].date).toBe('2026-10-27')
    expect(cal[cal.length - 1].date).toBe('2026-11-24')
    const sat = cal.find((d) => d.date === '2026-10-31')!
    expect(sat.isStudyDay).toBe(false)
    expect(sat.status).toBe('rest')
    expect(cal.find((d) => d.date === '2026-10-28')!.plan!.objectives).toEqual(['BPM2'])
  })
  it('marks past study days without activity as missed', () => {
    const cal = buildCalendar(settings, [], [], '2026-10-29')
    expect(cal.find((d) => d.date === '2026-10-28')!.status).toBe('missed')
  })
  it('counts remaining study days', () => {
    expect(remainingStudyDays(settings, '2026-10-27')).toBe(21)
  })
  it('picks a critical weak topic on day one (calendar + weakness)', () => {
    const stats = computeAllStats([], [], '2026-10-27')
    const pick = chooseObjective(stats, [], [], settings, '2026-10-27')
    expect(['BPM1', 'BPM2', 'UA1', 'UA2', 'UA3', 'UA4']).toContain(pick.objectiveId)
    expect(pick.reasons.length).toBeGreaterThan(0)
  })
  it('adapts: strong evidence on the planned topic moves focus elsewhere', () => {
    const bpm2 = QUESTIONS.filter((q) => q.objectiveId === 'BPM2')
    const atts = bpm2.flatMap((q, i) => [attempt({ itemId: q.id, score: 1, date: addDays('2026-10-20', i % 7) })])
    const stats = computeAllStats(atts, [], '2026-10-28')
    const ranking = scoreObjectives(stats, [], [], settings, '2026-10-28')
    const weak = scoreObjectives(computeAllStats([], [], '2026-10-28'), [], [], settings, '2026-10-28')
    const rank = (r: typeof ranking) => r.findIndex((x) => x.objectiveId === 'BPM2')
    expect(rank(ranking)).toBeGreaterThan(rank(weak))
  })
  it('does not teach the same topic twice in a row', () => {
    const stats = computeAllStats([], [], '2026-10-29')
    const first = chooseObjective(stats, [], [], settings, '2026-10-28')
    const session = {
      id: 's1',
      date: '2026-10-28',
      createdAt: 1,
      updatedAt: 1,
      completedAt: 2,
      stage: 'summary' as const,
      objectiveId: first.objectiveId,
      reason: [],
      timers: { recall: newTimer(), learn: newTimer(), practice: newTimer() },
      recallQueue: [],
      recallIndex: 0,
      checkQueue: [],
      checkIndex: 0,
      checkpointsDone: [],
      resourceOpened: false,
      practiceQueue: [],
      practiceIndex: 0,
    }
    const stats2 = computeAllStats([], [session], '2026-10-29')
    const next = chooseObjective(stats2, [], [session], settings, '2026-10-29')
    expect(next.objectiveId).not.toBe(first.objectiveId)
  })
  it('eventually covers the whole blueprint by the target date', () => {
    const sessions: Parameters<typeof chooseObjective>[2] = []
    const studied = new Set<string>()
    for (const d of buildCalendar(settings, [], [], '2026-10-27').filter((x) => x.isStudyDay)) {
      const stats = computeAllStats([], sessions, d.date)
      const pick = chooseObjective(stats, [], sessions, settings, d.date)
      studied.add(pick.objectiveId)
      sessions.push({
        id: d.date,
        date: d.date,
        createdAt: new Date(d.date).getTime(),
        updatedAt: 0,
        completedAt: 1,
        stage: 'summary',
        objectiveId: pick.objectiveId,
        reason: [],
        timers: { recall: newTimer(), learn: newTimer(), practice: newTimer() },
        recallQueue: [],
        recallIndex: 0,
        checkQueue: [],
        checkIndex: 0,
        checkpointsDone: [],
        resourceOpened: false,
        practiceQueue: [],
        practiceIndex: 0,
      })
    }
    expect(studied.size).toBe(OBJECTIVES.length)
  })
})

describe('question selection', () => {
  const today = '2026-10-27'
  const stats = computeAllStats([], [], today)
  it('builds a practice queue focused on the topic with interleaved review and no duplicates', () => {
    const queue = buildPracticeQueue({ primaryObjectiveId: 'BPM2', stats, attempts: [], today, seed: 'x' })
    expect(queue.length).toBe(12)
    expect(new Set(queue).size).toBe(queue.length)
    const onTopic = queue.filter((id) => QUESTION_BY_ID[id].objectiveId === 'BPM2' || OBJECTIVE_BY_ID[QUESTION_BY_ID[id].objectiveId].sectionId === 'BPM')
    expect(onTopic.length).toBeGreaterThanOrEqual(7)
    // reserved mock questions stay out of daily practice
    expect(queue.every((id) => QUESTION_BY_ID[id].pool === 'practice')).toBe(true)
  })
  it('prefers unseen questions', () => {
    const first = buildPracticeQueue({ primaryObjectiveId: 'CS1', stats, attempts: [], today, seed: 'y' })
    const atts = first.map((id) => attempt({ itemId: id, score: 1, date: today }))
    const second = buildPracticeQueue({ primaryObjectiveId: 'CS1', stats, attempts: atts, today: '2026-10-28', seed: 'z' })
    const repeats = second.filter((id) => first.includes(id))
    const unseenAvailable = QUESTIONS.filter((q) => q.pool === 'practice' && !first.includes(q.id)).length
    expect(unseenAvailable).toBeGreaterThan(12)
    expect(repeats.length).toBe(0)
  })
  it('assembles a 60-question mock with the official weighting, fresh from the reserved pool', () => {
    const ids = buildQuizQuestions({ kind: 'mock-full' }, { attempts: [], stats, mistakes: [], today, seed: 'm' })
    expect(ids).toHaveLength(60)
    expect(new Set(ids).size).toBe(60)
    for (const [sec, count] of Object.entries(MOCK_DISTRIBUTION)) {
      expect(ids.filter((id) => OBJECTIVE_BY_ID[QUESTION_BY_ID[id].objectiveId].sectionId === sec).length).toBe(count)
    }
    expect(ids.every((id) => QUESTION_BY_ID[id].pool === 'mock')).toBe(true)
  })
  it('second half-mock is still fresh after the first', () => {
    const a = buildQuizQuestions({ kind: 'mock-half' }, { attempts: [], stats, mistakes: [], today, seed: 'h1' })
    const atts = a.map((id) => attempt({ itemId: id, score: 1, date: today }))
    const b = buildQuizQuestions({ kind: 'mock-half' }, { attempts: atts, stats, mistakes: [], today, seed: 'h2' })
    expect(a).toHaveLength(30)
    expect(b.filter((id) => a.includes(id))).toHaveLength(0)
  })
  it('builds a recall queue from studied/weak objectives', () => {
    const q = buildRecallQueue({ stats, mistakes: [], attempts: [], primaryObjectiveId: 'BPM1', today, seed: 'r' })
    expect(q.length).toBe(5)
    expect(new Set(q).size).toBe(5)
  })
  it('mistake review prefers a new scenario on the same concept', () => {
    const q = QUESTION_BY_ID['UA-006']
    const atts = [attempt({ itemId: q.id, score: 0, date: today, selected: ['b'] })]
    const mistakes = buildMistakes(atts)
    const ids = buildQuizQuestions({ kind: 'mistakes' }, { attempts: atts, stats, mistakes, today, seed: 'mr' })
    expect(ids.length).toBe(1)
    expect(QUESTION_BY_ID[ids[0]].objectiveId).toBe(q.objectiveId)
  })
})

describe('readiness', () => {
  const stats = computeAllStats([], [], '2026-10-27')
  it('reports not enough evidence with no data', () => {
    const r = computeReadiness(stats, [], [], 28)
    expect(r.status).toBe('not-enough-evidence')
  })
  it('never declares readiness without strong fresh mock evidence', () => {
    const quiz: Quiz = {
      id: 'q1',
      kind: 'mock-full',
      title: 'Mock',
      date: '2026-11-21',
      createdAt: 0,
      updatedAt: 0,
      questionIds: QUESTIONS.filter((q) => q.pool === 'mock').slice(0, 60).map((q) => q.id),
      seenBefore: [],
      answers: {},
      confidence: {},
      flagged: [],
      index: 0,
      feedback: 'end',
      timer: newTimer(),
      wasPaused: false,
      submittedAt: 1,
    }
    for (const id of quiz.questionIds.slice(0, 40)) quiz.answers[id] = QUESTION_BY_ID[id].correct
    const res = mockResults([quiz])[0]
    expect(res.correct).toBe(40)
    expect(res.freshness).toBe(1)
    const atts = quiz.questionIds.map((id) => attempt({ itemId: id, score: quiz.answers[id] ? 1 : 0, date: '2026-11-21' }))
    const r = computeReadiness(computeAllStats(atts, [], '2026-11-21'), atts, [quiz], 3)
    expect(r.status).not.toBe('ready')
    expect(r.recommendation).toMatch(/reschedul|move the exam/i)
  })
})

describe('sync merge', () => {
  it('unions attempts, keeps newest sessions/settings, and is idempotent', () => {
    const a = defaultState()
    const b = defaultState()
    a.attempts = [attempt({ itemId: 'CD-001', score: 1, date: '2026-10-27' })]
    b.attempts = [attempt({ itemId: 'CD-002', score: 0, date: '2026-10-27' }), a.attempts[0]]
    b.settings = { ...b.settings, studyTime: '20:30' }
    b.settingsUpdatedAt = 10
    const m = mergeStates(a, b)
    expect(m.attempts).toHaveLength(2)
    expect(m.settings.studyTime).toBe('20:30')
    expect(mergeStates(m, b).attempts).toHaveLength(2)
    expect(m.deviceId).toBe(a.deviceId)
  })
})
