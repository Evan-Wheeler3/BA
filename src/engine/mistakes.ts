import { OBJECTIVE_BY_ID, objectiveWeight } from '../domain/blueprint'
import { QUESTION_BY_ID, RECALL_BY_ID } from '../domain/content'
import type { Attempt, Confidence, OptionId, SectionId } from '../domain/types'
import { addDays } from './dates'

/** An attempt counts as a mistake if MCQ wrong or recall rubric ≤ 2 (score < 0.75). */
export const MISTAKE_THRESHOLD = 0.75

export interface MistakeEntry {
  itemId: string
  kind: 'mcq' | 'recall'
  objectiveId: string
  sectionId: SectionId
  questionText: string
  yourAnswer: string
  correctAnswer: string
  whyWrong: string
  principle: string
  correctiveExercise: string
  count: number
  firstDate: string
  lastDate: string
  lastAttemptId: string
  nextReview: string
  resolved: boolean
  /** Later correct answer on a related question in the same objective. */
  improving: boolean
  confidentError: boolean
  confidence?: Confidence
  tags: string[]
}

function optionText(itemId: string, ids: OptionId[] | undefined): string {
  const q = QUESTION_BY_ID[itemId]
  if (!q || !ids?.length) return '(no answer)'
  return ids.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(' + ')
}

export function buildMistakes(attempts: Attempt[], dismissed: string[] = []): MistakeEntry[] {
  const sorted = [...attempts].sort((a, b) => a.ts - b.ts)
  const byItem = new Map<string, Attempt[]>()
  for (const a of sorted) {
    const list = byItem.get(a.itemId) ?? []
    list.push(a)
    byItem.set(a.itemId, list)
  }
  const entries: MistakeEntry[] = []
  for (const [itemId, list] of byItem) {
    const wrong = list.filter((a) => a.score < MISTAKE_THRESHOLD)
    if (!wrong.length) continue
    const last = wrong[wrong.length - 1]
    const laterCorrectSame = list.some((a) => a.ts > last.ts && a.score >= MISTAKE_THRESHOLD)
    const obj = OBJECTIVE_BY_ID[last.objectiveId]
    if (!obj) continue
    const q = QUESTION_BY_ID[itemId]
    const r = RECALL_BY_ID[itemId]
    const tags = q?.tags ?? []
    const improving =
      !laterCorrectSame &&
      sorted.some(
        (a) =>
          a.ts > last.ts &&
          a.itemId !== itemId &&
          a.objectiveId === last.objectiveId &&
          a.score >= MISTAKE_THRESHOLD &&
          (tags.length === 0 || (QUESTION_BY_ID[a.itemId]?.tags ?? []).some((t) => tags.includes(t))),
      )
    let entry: MistakeEntry
    if (q) {
      const chosenWrong = (last.selected ?? []).filter((id) => !q.correct.includes(id))
      const whyWrong =
        chosenWrong.map((id) => q.distractors[id]).filter(Boolean).join(' ') ||
        (last.selected && last.selected.length < q.correct.length
          ? `You selected ${last.selected.length} option(s); the question required ${q.correct.length}.`
          : 'Your selection did not include all of the correct options.')
      const correctText = optionText(itemId, q.correct)
      entry = {
        itemId,
        kind: 'mcq',
        objectiveId: last.objectiveId,
        sectionId: obj.sectionId,
        questionText: q.stem,
        yourAnswer: optionText(itemId, last.selected),
        correctAnswer: correctText,
        whyWrong,
        principle: q.principle,
        correctiveExercise: `In one sentence, explain why "${truncate(correctText, 90)}" is better than your choice. Then answer a fresh question on "${obj.title}" without notes.`,
        count: wrong.length,
        firstDate: wrong[0].date,
        lastDate: last.date,
        lastAttemptId: last.id,
        nextReview: addDays(last.date, improving ? 3 : 1),
        resolved: laterCorrectSame || dismissed.includes(itemId),
        improving,
        confidentError: wrong.some((a) => a.confidence === 'high'),
        confidence: last.confidence,
        tags,
      }
    } else if (r) {
      entry = {
        itemId,
        kind: 'recall',
        objectiveId: last.objectiveId,
        sectionId: obj.sectionId,
        questionText: r.prompt,
        yourAnswer: last.answerText?.trim() || '(no answer)',
        correctAnswer: r.modelAnswer,
        whyWrong: `Rubric ${last.rubric ?? Math.round(last.score * 4)}/4 — the answer did not cover all key points.`,
        principle: r.keyPoints.map((k) => k.label).join(' · '),
        correctiveExercise: `Tomorrow, answer from memory and make sure you cover: ${r.keyPoints.map((k) => k.label).join('; ')}.`,
        count: wrong.length,
        firstDate: wrong[0].date,
        lastDate: last.date,
        lastAttemptId: last.id,
        nextReview: addDays(last.date, 1),
        resolved: laterCorrectSame || dismissed.includes(itemId),
        improving,
        confidentError: wrong.some((a) => a.confidence === 'high'),
        confidence: last.confidence,
        tags: [],
      }
    } else continue
    entries.push(entry)
  }
  return entries.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0))
}

/**
 * Score a mistake for "Review my mistakes": higher = more likely to raise the exam score.
 * Objective weight × repetition × confident-error bonus × due bonus.
 */
export function mistakePriority(m: MistakeEntry, today: string): number {
  const w = objectiveWeight(m.objectiveId) * 19
  const repeat = 1 + 0.5 * (m.count - 1)
  const confident = m.confidentError ? 1.4 : 1
  const due = m.nextReview <= today ? 1.3 : 1
  const improving = m.improving ? 0.7 : 1
  return w * repeat * confident * due * improving
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
