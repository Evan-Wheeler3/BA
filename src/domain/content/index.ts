import type { Lesson, Question, RecallPrompt } from '../types'
import { BPM_QUESTIONS } from './questions/bpm'
import { CD_QUESTIONS } from './questions/cd'
import { CS_QUESTIONS } from './questions/cs'
import { RQ_QUESTIONS } from './questions/rq'
import { UA_QUESTIONS } from './questions/ua'
import { US_QUESTIONS } from './questions/us'
import { LESSONS_A } from './lessons/discovery-collab-bpm'
import { LESSONS_B } from './lessons/requirements-stories-uat'
import { RECALL_PROMPTS } from './recall'

export { RESOURCES, RESOURCE_BY_ID } from './resources'
export { RECALL_PROMPTS }

/** The exam-style bank used for diagnostics, practice, quizzes and mocks. */
export const QUESTIONS: Question[] = [
  ...CD_QUESTIONS,
  ...CS_QUESTIONS,
  ...BPM_QUESTIONS,
  ...RQ_QUESTIONS,
  ...US_QUESTIONS,
  ...UA_QUESTIONS,
]

export const LESSONS: Lesson[] = [...LESSONS_A, ...LESSONS_B]

/** Short lesson knowledge checks (not part of the exam-style bank). */
export const CHECK_QUESTIONS: Question[] = LESSONS.flatMap((l) => l.checks)

const ALL_MCQ = [...QUESTIONS, ...CHECK_QUESTIONS]
export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(ALL_MCQ.map((q) => [q.id, q]))
export const RECALL_BY_ID: Record<string, RecallPrompt> = Object.fromEntries(RECALL_PROMPTS.map((r) => [r.id, r]))
export const LESSON_BY_OBJECTIVE: Record<string, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.objectiveId, l]))

export const DIAGNOSTIC_IDS: string[] = QUESTIONS.filter((q) => q.diagnostic).map((q) => q.id)
