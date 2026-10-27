// Core domain types. Content (questions, lessons, prompts) is plain data and is
// kept separate from grading/scheduling logic (src/engine) and UI (src/ui, src/pages).

export type SectionId = 'CD' | 'CS' | 'BPM' | 'RQ' | 'US' | 'UA'

export interface Section {
  id: SectionId
  name: string
  /** Official exam weight as a fraction (0.12 = 12%). */
  weight: number
  /** Results from the user's previous attempt. */
  baseline: { correct: number; total: number }
  priority: 'Critical' | 'High' | 'Maintain'
}

export interface Objective {
  id: string
  sectionId: SectionId
  /** Short label used in lists. */
  title: string
  /** Paraphrase of the official exam-guide objective (not verbatim). */
  description: string
  /** Number of other objectives that build on this concept (used in prioritisation). */
  dependents: number
}

export type OptionId = 'a' | 'b' | 'c' | 'd' | 'e'

export interface QuestionOption {
  id: OptionId
  text: string
}

export interface Question {
  id: string
  objectiveId: string
  difficulty: 1 | 2 | 3
  /** Scenario and question text. Multi-select questions say "Choose N." */
  stem: string
  options: QuestionOption[]
  /** Exactly one id for single-answer questions; N ids for "Choose N" questions. */
  correct: OptionId[]
  explanation: string
  /** Why each wrong option is weaker or incorrect, keyed by option id. */
  distractors: Partial<Record<OptionId, string>>
  /** The principle to remember (shown in the mistake notebook). */
  principle: string
  tags: string[]
  /** Reserved for the first full-length mock so at least one mock is completely fresh. */
  pool: 'practice' | 'mock'
  /** Included in the first-launch diagnostic. */
  diagnostic?: boolean
  version: number
  provenance: 'curated-original'
}

export interface KeyPoint {
  /** What the learner should have said, in plain words. */
  label: string
  /**
   * Alternatives that count as covering this point. Each alternative is a list of
   * word stems that must all appear in the answer (case-insensitive, prefix match).
   */
  any: string[][]
}

export type RecallKind = 'short' | 'scenario' | 'difference' | 'first-step'

export interface RecallPrompt {
  id: string
  objectiveId: string
  kind: RecallKind
  prompt: string
  keyPoints: KeyPoint[]
  modelAnswer: string
}

export interface ResourceRef {
  resourceId: string
  /** Exact unit/section/heading to focus on. */
  focus: string
  minutes: number
}

export interface Lesson {
  objectiveId: string
  learningObjective: string
  /** Original coach summary (not official Salesforce content). */
  explanation: string[]
  salesforceExample: string
  takeaways: string[]
  primary: ResourceRef
  alternatives: ResourceRef[]
  /** Why this matters given the user's previous results. */
  whyItMatters: string
  /** Short knowledge check shown after the resource. */
  checks: Question[]
}

export type VerificationStatus =
  /** Opened and reviewed directly. */
  | 'reviewed'
  /** Confirmed to exist via a search-engine index entry with matching title/description, but not opened. */
  | 'indexed'
  /** Supplied by the user or official prep material, but not independently confirmed. */
  | 'unverified'

export interface Resource {
  id: string
  title: string
  publisher: string
  url: string
  official: boolean
  sectionIds: SectionId[]
  objectiveIds: string[]
  minutes: number
  access: 'Free' | 'Free (Trailhead login to track progress)' | 'Free account required' | 'Paid' | 'Unknown'
  description: string
  status: VerificationStatus
  /** ISO date the status was last established. */
  lastChecked: string
  verificationNote: string
}

// ---------- User data (event log) ----------

export type Confidence = 'low' | 'med' | 'high'

export type AttemptSource =
  | 'diagnostic'
  | 'session-recall'
  | 'session-check'
  | 'session-practice'
  | 'quiz'
  | 'mock'
  | 'mistake-review'

export interface Attempt {
  id: string
  ts: number
  /** Local calendar date YYYY-MM-DD. */
  date: string
  kind: 'mcq' | 'recall'
  source: AttemptSource
  itemId: string
  objectiveId: string
  /** Normalised 0..1 (MCQ: 0 or 1; recall: rubric / 4). */
  score: number
  /** Recall rubric 0..4. */
  rubric?: number
  /** Automatic rubric score before a manual adjustment. */
  autoRubric?: number
  gradedBy?: 'keywords' | 'ai' | 'self'
  selected?: OptionId[]
  answerText?: string
  confidence?: Confidence
  sessionId?: string
  quizId?: string
}

export type StageId = 'recall' | 'learn' | 'practice'

export interface StageTimer {
  /** Accumulated milliseconds from completed run segments. */
  accumulatedMs: number
  /** Epoch ms when the current run segment started; undefined when paused. */
  runningSince?: number
}

export interface StudySession {
  id: string
  date: string
  createdAt: number
  updatedAt: number
  completedAt?: number
  abandoned?: boolean
  stage: StageId | 'summary'
  objectiveId: string
  reason: string[]
  timers: Record<StageId, StageTimer>
  recallQueue: string[]
  recallIndex: number
  checkQueue: string[]
  checkIndex: number
  checkpointsDone: number[]
  resourceOpened: boolean
  practiceQueue: string[]
  practiceIndex: number
}

export type QuizKind =
  | 'diagnostic'
  | 'quick'
  | 'section'
  | 'weak'
  | 'mistakes'
  | 'mock-full'
  | 'mock-half'
  | 'readiness'

export interface Quiz {
  id: string
  kind: QuizKind
  title: string
  date: string
  createdAt: number
  updatedAt: number
  questionIds: string[]
  /** Question ids that had been answered before this quiz began (for freshness and "seen before" labels). */
  seenBefore: string[]
  answers: Record<string, OptionId[]>
  confidence: Record<string, Confidence>
  flagged: string[]
  index: number
  /** 'immediate' = feedback after each question; 'end' = exam-style review after submit. */
  feedback: 'immediate' | 'end'
  timeLimitMs?: number
  timer: StageTimer
  /** True if the timer was ever paused (not exam-realistic). */
  wasPaused: boolean
  submittedAt?: number
}

export interface ReminderSettings {
  /** User intent; only true after a successful subscription. */
  enabled: boolean
  followUp: boolean
  followUpMinutes: number
  /** Local date (inclusive) until which reminders are paused. */
  pausedUntil?: string
  lastTestOk?: number
}

export interface Settings {
  studyDays: number[]
  studyTime: string
  targetDate: string
  stageMinutes: Record<StageId, number>
  theme: 'system' | 'light' | 'dark'
  reminders: ReminderSettings
  aiGrading: boolean
  timezone: string
}

export interface AppState {
  schemaVersion: 1
  deviceId: string
  updatedAt: number
  settings: Settings
  /** Updated when settings change, so sync can pick the latest. */
  settingsUpdatedAt: number
  attempts: Attempt[]
  sessions: StudySession[]
  quizzes: Quiz[]
  /** User notes on mistakes, keyed by attempt id. */
  notes: Record<string, string>
  /** Item ids whose mistakes the user has marked as resolved manually. */
  dismissedMistakes: string[]
}
