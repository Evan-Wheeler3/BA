import { OBJECTIVE_BY_ID } from '../domain/blueprint'
import { QUESTION_BY_ID, RECALL_BY_ID } from '../domain/content'
import type {
  AppState,
  Attempt,
  AttemptSource,
  Confidence,
  OptionId,
  Quiz,
  QuizKind,
  SectionId,
  Settings,
  StageId,
  StudySession,
} from '../domain/types'
import { today as todayStr } from '../engine/dates'
import { isCorrect, rubricToScore } from '../engine/grading'
import { computeAllStats } from '../engine/mastery'
import { buildMistakes } from '../engine/mistakes'
import { chooseObjective } from '../engine/planner'
import {
  buildPracticeQueue,
  buildQuizQuestions,
  buildRecallQueue,
  history,
  lessonCheckIds,
  quizTimeLimitMs,
} from '../engine/selection'
import { capIdle, elapsed, newTimer, pause, start } from '../engine/timer'
import { uid } from './model'
import { getState, setState } from './store'

const STAGES: StageId[] = ['recall', 'learn', 'practice']
/** A single run segment longer than this is treated as the app being left open. */
const MAX_IDLE_SEGMENT_MS = 45 * 60_000

// ---------------- Attempts ----------------

export function recordMcqAttempt(input: {
  questionId: string
  selected: OptionId[]
  source: AttemptSource
  confidence?: Confidence
  sessionId?: string
  quizId?: string
}): Attempt {
  const q = QUESTION_BY_ID[input.questionId]
  if (!q) throw new Error(`Unknown question ${input.questionId}`)
  const now = Date.now()
  const attempt: Attempt = {
    id: uid(),
    ts: now,
    date: todayStr(new Date(now)),
    kind: 'mcq',
    source: input.source,
    itemId: q.id,
    objectiveId: q.objectiveId,
    score: isCorrect(q, input.selected) ? 1 : 0,
    selected: [...input.selected].sort(),
    confidence: input.confidence,
    sessionId: input.sessionId,
    quizId: input.quizId,
  }
  setState((s) => ({ ...s, attempts: [...s.attempts, attempt] }))
  return attempt
}

export function recordRecallAttempt(input: {
  promptId: string
  answerText: string
  rubric: number
  autoRubric: number
  gradedBy: Attempt['gradedBy']
  confidence?: Confidence
  sessionId?: string
}): Attempt {
  const p = RECALL_BY_ID[input.promptId]
  if (!p) throw new Error(`Unknown prompt ${input.promptId}`)
  const now = Date.now()
  const attempt: Attempt = {
    id: uid(),
    ts: now,
    date: todayStr(new Date(now)),
    kind: 'recall',
    source: 'session-recall',
    itemId: p.id,
    objectiveId: p.objectiveId,
    score: rubricToScore(input.rubric),
    rubric: input.rubric,
    autoRubric: input.autoRubric,
    gradedBy: input.gradedBy,
    answerText: input.answerText.slice(0, 4000),
    confidence: input.confidence,
    sessionId: input.sessionId,
  }
  setState((s) => ({ ...s, attempts: [...s.attempts, attempt] }))
  return attempt
}

/** Adjust the rubric of a recall attempt (self-grading override). */
export function adjustRecallRubric(attemptId: string, rubric: number) {
  setState((s) => ({
    ...s,
    attempts: s.attempts.map((a) =>
      a.id === attemptId ? { ...a, rubric, score: rubricToScore(rubric), gradedBy: 'self' } : a,
    ),
  }))
}

// ---------------- Sessions ----------------

export function activeSession(s: AppState = getState()): StudySession | undefined {
  return [...s.sessions]
    .filter((x) => !x.completedAt && !x.abandoned)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

export function startSession(objectiveOverride?: string): StudySession {
  const s = getState()
  const existing = activeSession(s)
  if (existing) return existing
  const today = todayStr()
  const stats = computeAllStats(s.attempts, s.sessions, today)
  const mistakes = buildMistakes(s.attempts, s.dismissedMistakes)
  const choice = objectiveOverride
    ? { objectiveId: objectiveOverride, reasons: ['chosen by you'] }
    : chooseObjective(stats, mistakes, s.sessions, s.settings, today)
  const seed = `${today}-${s.sessions.length}-${Date.now()}`
  const now = Date.now()
  const session: StudySession = {
    id: uid(),
    date: today,
    createdAt: now,
    updatedAt: now,
    stage: 'recall',
    objectiveId: choice.objectiveId,
    reason: choice.reasons,
    timers: { recall: start(newTimer(), now), learn: newTimer(), practice: newTimer() },
    recallQueue: buildRecallQueue({
      stats,
      mistakes,
      attempts: s.attempts,
      primaryObjectiveId: choice.objectiveId,
      today,
      seed,
    }),
    recallIndex: 0,
    checkQueue: lessonCheckIds(choice.objectiveId),
    checkIndex: 0,
    checkpointsDone: [],
    resourceOpened: false,
    practiceQueue: buildPracticeQueue({ primaryObjectiveId: choice.objectiveId, stats, attempts: s.attempts, today, seed }),
    practiceIndex: 0,
  }
  setState((st) => ({ ...st, sessions: [...st.sessions, session] }))
  return session
}

function updateSession(id: string, fn: (x: StudySession) => StudySession) {
  setState((s) => ({
    ...s,
    sessions: s.sessions.map((x) => (x.id === id ? { ...fn(x), updatedAt: Date.now() } : x)),
  }))
}

export function patchSession(id: string, patch: Partial<StudySession>) {
  updateSession(id, (x) => ({ ...x, ...patch }))
}

export function goToStage(id: string, stage: StageId | 'summary') {
  const now = Date.now()
  updateSession(id, (x) => {
    const timers = { ...x.timers }
    for (const st of STAGES) timers[st] = pause(timers[st], now)
    if (stage !== 'summary') timers[stage] = start(timers[stage], now)
    return { ...x, stage, timers }
  })
}

export function pauseSession(id: string) {
  const now = Date.now()
  updateSession(id, (x) => {
    const timers = { ...x.timers }
    for (const st of STAGES) timers[st] = pause(timers[st], now)
    return { ...x, timers }
  })
}

export function resumeSession(id: string) {
  const now = Date.now()
  updateSession(id, (x) => {
    if (x.stage === 'summary') return x
    const timers = { ...x.timers }
    for (const st of STAGES) timers[st] = pause(capIdle(timers[st], MAX_IDLE_SEGMENT_MS, now), now)
    timers[x.stage] = start(timers[x.stage], now)
    return { ...x, timers }
  })
}

/** Called when the app becomes visible again: cap runaway segments from a forgotten session. */
export function capIdleTimers() {
  const s = getState()
  const now = Date.now()
  for (const x of s.sessions) {
    if (x.completedAt || x.abandoned) continue
    const running = STAGES.find((st) => x.timers[st].runningSince !== undefined)
    if (running && now - x.timers[running].runningSince! > MAX_IDLE_SEGMENT_MS) {
      updateSession(x.id, (y) => ({ ...y, timers: { ...y.timers, [running]: capIdle(y.timers[running], MAX_IDLE_SEGMENT_MS, now) } }))
    }
  }
}

export function completeSession(id: string) {
  const now = Date.now()
  updateSession(id, (x) => {
    const timers = { ...x.timers }
    for (const st of STAGES) timers[st] = pause(timers[st], now)
    return { ...x, stage: 'summary', timers, completedAt: now }
  })
}

export function abandonSession(id: string) {
  const now = Date.now()
  updateSession(id, (x) => {
    const timers = { ...x.timers }
    for (const st of STAGES) timers[st] = pause(timers[st], now)
    return { ...x, timers, abandoned: true }
  })
}

export function sessionElapsed(x: StudySession, now = Date.now()): number {
  return STAGES.reduce((sum, st) => sum + elapsed(x.timers[st], now), 0)
}

// ---------------- Quizzes ----------------

const QUIZ_TITLES: Record<QuizKind, string> = {
  diagnostic: 'Diagnostic',
  quick: 'Quick mixed quiz',
  section: 'Section quiz',
  weak: 'Weak-area quiz',
  mistakes: 'Review my mistakes',
  'mock-full': 'Full mock exam',
  'mock-half': 'Half mock exam',
  readiness: 'Final readiness assessment',
}

export function createQuiz(kind: QuizKind, opts: { sectionId?: SectionId; objectiveIds?: string[] } = {}): Quiz | null {
  const s = getState()
  const today = todayStr()
  const stats = computeAllStats(s.attempts, s.sessions, today)
  const mistakes = buildMistakes(s.attempts, s.dismissedMistakes)
  const seed = `${kind}-${Date.now()}`
  const questionIds = buildQuizQuestions(
    { kind, sectionId: opts.sectionId, objectiveIds: opts.objectiveIds },
    { attempts: s.attempts, stats, mistakes, today, seed },
  )
  if (!questionIds.length) return null
  const seen = history(s.attempts).seen
  const now = Date.now()
  const exam = kind === 'mock-full' || kind === 'mock-half' || kind === 'readiness' || kind === 'diagnostic'
  let title = QUIZ_TITLES[kind]
  if (kind === 'section' && opts.sectionId) title = `Section quiz — ${opts.sectionId}`
  if (kind === 'weak' && opts.objectiveIds?.length === 1) title = `Topic quiz — ${OBJECTIVE_BY_ID[opts.objectiveIds[0]].title}`
  const quiz: Quiz = {
    id: uid(),
    kind,
    title,
    date: today,
    createdAt: now,
    updatedAt: now,
    questionIds,
    seenBefore: questionIds.filter((id) => seen.has(id)),
    answers: {},
    confidence: {},
    flagged: [],
    index: 0,
    feedback: exam ? 'end' : 'immediate',
    timeLimitMs: quizTimeLimitMs(kind, questionIds.length),
    timer: start(newTimer(), now),
    wasPaused: false,
  }
  setState((st) => ({ ...st, quizzes: [...st.quizzes, quiz] }))
  return quiz
}

function updateQuiz(id: string, fn: (q: Quiz) => Quiz) {
  setState((s) => ({
    ...s,
    quizzes: s.quizzes.map((q) => (q.id === id ? { ...fn(q), updatedAt: Date.now() } : q)),
  }))
}

export function setQuizAnswer(quizId: string, questionId: string, selected: OptionId[], confidence?: Confidence) {
  updateQuiz(quizId, (q) => ({
    ...q,
    answers: { ...q.answers, [questionId]: selected },
    confidence: confidence ? { ...q.confidence, [questionId]: confidence } : q.confidence,
  }))
}

/** Immediate-feedback quizzes record the attempt as soon as an answer is submitted. */
export function submitQuizQuestion(quizId: string, questionId: string, selected: OptionId[], confidence?: Confidence) {
  const quiz = getState().quizzes.find((q) => q.id === quizId)
  if (!quiz) return
  setQuizAnswer(quizId, questionId, selected, confidence)
  const source: AttemptSource = quiz.kind === 'mistakes' ? 'mistake-review' : quiz.kind === 'diagnostic' ? 'diagnostic' : 'quiz'
  recordMcqAttempt({ questionId, selected, source, confidence, quizId })
}

export function setQuizIndex(quizId: string, index: number) {
  updateQuiz(quizId, (q) => ({ ...q, index: Math.max(0, Math.min(q.questionIds.length - 1, index)) }))
}

export function toggleFlag(quizId: string, questionId: string) {
  updateQuiz(quizId, (q) => ({
    ...q,
    flagged: q.flagged.includes(questionId) ? q.flagged.filter((f) => f !== questionId) : [...q.flagged, questionId],
  }))
}

export function pauseQuiz(quizId: string) {
  updateQuiz(quizId, (q) => ({ ...q, timer: pause(q.timer), wasPaused: true }))
}

export function resumeQuiz(quizId: string) {
  updateQuiz(quizId, (q) => ({ ...q, timer: start(q.timer) }))
}

/** Submit an exam-style quiz: record attempts for every answered question. */
export function submitQuiz(quizId: string) {
  const s = getState()
  const quiz = s.quizzes.find((q) => q.id === quizId)
  if (!quiz || quiz.submittedAt) return
  if (quiz.feedback === 'end') {
    const source: AttemptSource = quiz.kind === 'diagnostic' ? 'diagnostic' : quiz.kind.startsWith('mock') || quiz.kind === 'readiness' ? 'mock' : 'quiz'
    for (const qid of quiz.questionIds) {
      // Unanswered questions count as incorrect, as on the real exam.
      recordMcqAttempt({ questionId: qid, selected: quiz.answers[qid] ?? [], source, confidence: quiz.confidence[qid], quizId })
    }
  }
  updateQuiz(quizId, (q) => ({ ...q, timer: pause(q.timer), submittedAt: Date.now() }))
}

export function discardQuiz(quizId: string) {
  setState((s) => ({ ...s, quizzes: s.quizzes.filter((q) => q.id !== quizId || q.submittedAt) }))
}

export function openQuiz(kind?: QuizKind): Quiz | undefined {
  return [...getState().quizzes]
    .filter((q) => !q.submittedAt && (!kind || q.kind === kind))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

// ---------------- Settings, notes, data ----------------

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch }, settingsUpdatedAt: Date.now() }))
}

export function setNote(attemptOrItemId: string, note: string) {
  setState((s) => ({ ...s, notes: { ...s.notes, [attemptOrItemId]: note.slice(0, 2000) } }))
}

export function dismissMistake(itemId: string, dismissed: boolean) {
  setState((s) => ({
    ...s,
    dismissedMistakes: dismissed
      ? [...new Set([...s.dismissedMistakes, itemId])]
      : s.dismissedMistakes.filter((x) => x !== itemId),
  }))
}
