import type { OptionId, Question, RecallKind, RecallPrompt, KeyPoint } from '../types'

const LETTERS: OptionId[] = ['a', 'b', 'c', 'd', 'e']

/** Small deterministic string hash (FNV-1a). */
export function hash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic permutation of [0..n) seeded by a string. */
export function seededPermutation(n: number, seed: string): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  let s = hash(seed) || 1
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

interface McqInput {
  id: string
  obj: string
  diff: 1 | 2 | 3
  stem: string
  /** Options in authored order; letters a, b, c... refer to this order. */
  options: string[]
  /** Authored letter(s) of the correct option(s), e.g. 'a' or 'a,c'. */
  answer: string
  why: string
  /** Why each wrong option is weaker, keyed by authored letter. */
  wrong: Partial<Record<OptionId, string>>
  principle: string
  tags: string[]
  pool?: 'practice' | 'mock'
  diagnostic?: boolean
  /** Keep authored order (e.g. options that reference each other). */
  fixedOrder?: boolean
}

/**
 * Build a question. Options are shuffled deterministically by id so that
 * correct-answer positions are balanced across the bank, and the answer key and
 * distractor rationales are remapped to the shuffled letters.
 */
export function mcq(input: McqInput): Question {
  const n = input.options.length
  const perm = input.fixedOrder ? Array.from({ length: n }, (_, i) => i) : seededPermutation(n, input.id)
  // perm[newIndex] = authoredIndex
  const authoredToNew = new Map<OptionId, OptionId>()
  perm.forEach((authoredIdx, newIdx) => authoredToNew.set(LETTERS[authoredIdx], LETTERS[newIdx]))
  const options = perm.map((authoredIdx, newIdx) => ({ id: LETTERS[newIdx], text: input.options[authoredIdx] }))
  const correct = input.answer
    .split(',')
    .map((l) => l.trim() as OptionId)
    .map((l) => {
      const mapped = authoredToNew.get(l)
      if (!mapped) throw new Error(`${input.id}: answer letter ${l} has no option`)
      return mapped
    })
    .sort()
  const distractors: Partial<Record<OptionId, string>> = {}
  for (const [letter, text] of Object.entries(input.wrong) as [OptionId, string][]) {
    const mapped = authoredToNew.get(letter)
    if (!mapped) throw new Error(`${input.id}: distractor letter ${letter} has no option`)
    distractors[mapped] = text
  }
  return {
    id: input.id,
    objectiveId: input.obj,
    difficulty: input.diff,
    stem: input.stem,
    options,
    correct,
    explanation: input.why,
    distractors,
    principle: input.principle,
    tags: input.tags,
    pool: input.pool ?? 'practice',
    diagnostic: input.diagnostic,
    version: 1,
    provenance: 'curated-original',
  }
}

export function recall(
  id: string,
  objectiveId: string,
  kind: RecallKind,
  prompt: string,
  keyPoints: KeyPoint[],
  modelAnswer: string,
): RecallPrompt {
  return { id, objectiveId, kind, prompt, keyPoints, modelAnswer }
}

/** Shorthand for a key point: label plus alternatives written as space-separated stems. */
export function kp(label: string, ...alternatives: string[]): KeyPoint {
  return { label, any: alternatives.map((a) => a.split(/\s+/).filter(Boolean)) }
}
