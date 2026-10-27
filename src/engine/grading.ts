import type { KeyPoint, OptionId, Question, RecallPrompt } from '../domain/types'

// ---------- Multiple choice ----------

export function isCorrect(question: Question, selected: OptionId[]): boolean {
  if (selected.length !== question.correct.length) return false
  const s = [...selected].sort()
  return question.correct.every((c, i) => c === s[i])
}

/** Number of options the learner must select. */
export function requiredSelections(question: Question): number {
  return question.correct.length
}

// ---------- Recall (0–4 rubric) ----------

export const RUBRIC_LABELS: Record<number, string> = {
  0: 'Incorrect or no meaningful understanding',
  1: 'Related concept, misses the central point',
  2: 'Partially correct but incomplete',
  3: 'Correct and reasonably complete',
  4: 'Correct, complete and applied to the scenario',
}

export interface RecallGrade {
  rubric: 0 | 1 | 2 | 3 | 4
  matched: KeyPoint[]
  missed: KeyPoint[]
  coverage: number
}

export function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

/**
 * A stem matches a word if the word starts with it. Very short stems (≤ 2 chars,
 * e.g. "po", "8") must match a whole word to avoid false positives.
 */
function stemMatches(stem: string, words: string[]): boolean {
  const s = stem.toLowerCase()
  if (s.length <= 2) return words.includes(s)
  return words.some((w) => w.startsWith(s))
}

/** Every stem in an alternative must appear somewhere in the answer (any order). */
function alternativeMatches(alternative: string[], words: string[]): boolean {
  return alternative.every((stem) => stemMatches(stem, words))
}

export function keyPointMatched(point: KeyPoint, answer: string): boolean {
  const words = normalise(answer)
  return point.any.some((alt) => alternativeMatches(alt, words))
}

/**
 * Transparent keyword-coverage grading. It accepts equivalent wording through
 * multiple alternative stems per key point, but it cannot judge reasoning, so the
 * learner can always adjust the score (and optional AI grading can be enabled).
 *
 * Mapping: < 3 meaningful words → 0. Coverage = matched / total key points.
 *   coverage = 0       → 0
 *   coverage < 0.4     → 1
 *   coverage < 0.7     → 2
 *   coverage < 1       → 3
 *   coverage = 1       → 4 (scenario/first-step prompts must also be ≥ 12 words,
 *                           otherwise 3 — a bare list is not "applied to the scenario")
 */
export function gradeRecall(prompt: RecallPrompt, answer: string): RecallGrade {
  const words = normalise(answer)
  const matched: KeyPoint[] = []
  const missed: KeyPoint[] = []
  for (const kp of prompt.keyPoints) {
    if (words.length > 0 && kp.any.some((alt) => alternativeMatches(alt, words))) matched.push(kp)
    else missed.push(kp)
  }
  const coverage = prompt.keyPoints.length ? matched.length / prompt.keyPoints.length : 0
  let rubric: RecallGrade['rubric']
  if (words.length < 3 || coverage === 0) rubric = 0
  else if (coverage < 0.4) rubric = 1
  else if (coverage < 0.7) rubric = 2
  else if (coverage < 1) rubric = 3
  else {
    const needsApplication = prompt.kind === 'scenario' || prompt.kind === 'first-step'
    rubric = needsApplication && words.length < 12 ? 3 : 4
  }
  return { rubric, matched, missed, coverage }
}

export function rubricToScore(rubric: number): number {
  return Math.max(0, Math.min(4, rubric)) / 4
}
