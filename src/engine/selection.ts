import { MOCK_DISTRIBUTION, OBJECTIVE_BY_ID, objectivesForSection } from '../domain/blueprint'
import { DIAGNOSTIC_IDS, LESSON_BY_OBJECTIVE, QUESTIONS, QUESTION_BY_ID, RECALL_PROMPTS } from '../domain/content'
import { seededPermutation } from '../domain/content/build'
import type { Attempt, Question, QuizKind, SectionId } from '../domain/types'
import { daysBetween } from './dates'
import type { AllStats } from './mastery'
import { MISTAKE_THRESHOLD, mistakePriority, type MistakeEntry } from './mistakes'

export function shuffle<T>(items: T[], seed: string): T[] {
  return seededPermutation(items.length, seed).map((i) => items[i])
}

interface History {
  lastTs: Map<string, number>
  lastScore: Map<string, number>
  lastDate: Map<string, string>
  seen: Set<string>
}

export function history(attempts: Attempt[]): History {
  const lastTs = new Map<string, number>()
  const lastScore = new Map<string, number>()
  const lastDate = new Map<string, string>()
  for (const a of [...attempts].sort((x, y) => x.ts - y.ts)) {
    lastTs.set(a.itemId, a.ts)
    lastScore.set(a.itemId, a.score)
    lastDate.set(a.itemId, a.date)
  }
  return { lastTs, lastScore, lastDate, seen: new Set(lastTs.keys()) }
}

/**
 * Questions reserved for mocks ("mock" pool) are kept out of everyday practice until
 * they have been seen in a mock, so the first mock exam(s) are genuinely fresh.
 */
function eligibleForPractice(q: Question, h: History): boolean {
  return q.pool === 'practice' || h.seen.has(q.id)
}

/**
 * Freshness tier: 0 = never seen, 1 = previously wrong and not seen today (a retry,
 * labelled as such in the UI), 2 = already answered correctly (or seen today).
 */
function tierOf(q: Question, h: History, today: string): 0 | 1 | 2 {
  if (!h.seen.has(q.id)) return 0
  const score = h.lastScore.get(q.id) ?? 1
  const lastDate = h.lastDate.get(q.id) ?? today
  if (score < MISTAKE_THRESHOLD && daysBetween(lastDate, today) >= 1) return 1
  return 2
}

/** Rank candidates: unseen first, then retries, then least-recently-seen. */
function rankQuestions(candidates: Question[], h: History, today: string, seed: string): Question[] {
  return shuffle(candidates, seed)
    .map((q, i) => ({ q, i, t: tierOf(q, h, today), ts: h.lastTs.get(q.id) ?? 0 }))
    .sort((a, b) => a.t - b.t || (a.t === 2 ? a.ts - b.ts : a.i - b.i))
    .map((x) => x.q)
}

export function pickPracticeQuestions(opts: {
  objectiveIds: string[]
  n: number
  attempts: Attempt[]
  today: string
  seed: string
  exclude?: Set<string>
  includeMockPool?: boolean
  /** Only unseen questions and retries (no questions already answered correctly). */
  freshOnly?: boolean
}): Question[] {
  const h = history(opts.attempts)
  const candidates = QUESTIONS.filter(
    (q) =>
      opts.objectiveIds.includes(q.objectiveId) &&
      !opts.exclude?.has(q.id) &&
      (opts.includeMockPool || eligibleForPractice(q, h)) &&
      (!opts.freshOnly || tierOf(q, h, opts.today) < 2),
  )
  return rankQuestions(candidates, h, opts.today, opts.seed).slice(0, opts.n)
}

/** Build the Stage C practice queue: mostly today’s topic, plus interleaved review. */
export function buildPracticeQueue(opts: {
  primaryObjectiveId: string
  stats: AllStats
  attempts: Attempt[]
  today: string
  seed: string
  size?: number
}): string[] {
  const size = opts.size ?? 12
  const primaryN = Math.round(size * 0.65)
  const sectionIds = objectivesForSection(OBJECTIVE_BY_ID[opts.primaryObjectiveId].sectionId).map((o) => o.id)
  const base = { attempts: opts.attempts, today: opts.today }
  // Fill order: fresh on the topic → fresh in the same section → least-recently-seen on the topic → section.
  const primary: Question[] = []
  const chosen = new Set<string>()
  const steps = [
    { objectiveIds: [opts.primaryObjectiveId], freshOnly: true },
    { objectiveIds: sectionIds, freshOnly: true },
    { objectiveIds: [opts.primaryObjectiveId], freshOnly: false },
    { objectiveIds: sectionIds, freshOnly: false },
  ]
  steps.forEach((step, i) => {
    if (primary.length >= primaryN) return
    for (const q of pickPracticeQuestions({
      ...base,
      ...step,
      n: primaryN - primary.length,
      seed: `${opts.seed}-p${i}`,
      exclude: chosen,
    })) {
      primary.push(q)
      chosen.add(q.id)
    }
  })
  // Interleave: one question each from other due/weak objectives.
  const others = [...opts.stats.objectives]
    .filter((o) => o.objective.id !== opts.primaryObjectiveId)
    .sort((a, b) => Number(b.due) - Number(a.due) || a.estimate - b.estimate)
  const interleaved: Question[] = []
  for (const o of others) {
    if (primary.length + interleaved.length >= size) break
    const [q] = pickPracticeQuestions({
      objectiveIds: [o.objective.id],
      n: 1,
      ...base,
      seed: `${opts.seed}-${o.objective.id}`,
      exclude: chosen,
    })
    if (q) {
      interleaved.push(q)
      chosen.add(q.id)
    }
  }
  // Interleave review questions between topic questions rather than at the end.
  const out: string[] = []
  const p = [...primary]
  const r = [...interleaved]
  while (p.length || r.length) {
    if (p.length) out.push(p.shift()!.id)
    if (p.length) out.push(p.shift()!.id)
    if (r.length) out.push(r.shift()!.id)
  }
  return out
}

/** Stage A recall queue: previously studied, due or error-prone objectives. */
export function buildRecallQueue(opts: {
  stats: AllStats
  mistakes: MistakeEntry[]
  attempts: Attempt[]
  primaryObjectiveId: string
  today: string
  seed: string
  size?: number
}): string[] {
  const size = opts.size ?? 5
  const h = history(opts.attempts)
  const unresolvedByObj = new Map<string, number>()
  for (const m of opts.mistakes) if (!m.resolved) unresolvedByObj.set(m.objectiveId, (unresolvedByObj.get(m.objectiveId) ?? 0) + 1)

  const studied = opts.stats.objectives.filter((o) => o.lastStudied !== null)
  let ordered: string[]
  if (studied.length === 0) {
    // First session: check retention from the previous preparation, weakest baseline first.
    ordered = [...opts.stats.objectives].sort((a, b) => a.estimate - b.estimate).map((o) => o.objective.id)
  } else {
    const rank = (id: string) => {
      const o = opts.stats.byId[id]
      let s = 0
      if (o.due) s += 3
      s += Math.min(3, unresolvedByObj.get(id) ?? 0)
      s += o.confidentErrors > 0 ? 1.5 : 0
      s += (1 - o.estimate) * 2
      if (o.lastStudied) s += Math.min(2, daysBetween(o.lastStudied, opts.today) / 4)
      return s
    }
    ordered = studied.map((o) => o.objective.id).sort((a, b) => rank(b) - rank(a))
    // Strong topics still get occasional low-frequency review.
    const notStudied = opts.stats.objectives.filter((o) => o.lastStudied === null).map((o) => o.objective.id)
    ordered = [...ordered, ...notStudied]
  }
  // Prefer not to quiz today’s new topic during recall (it hasn’t been taught yet today).
  const withoutPrimary = ordered.filter((id) => id !== opts.primaryObjectiveId)
  if (withoutPrimary.length >= size) ordered = withoutPrimary

  const out: string[] = []
  for (const objectiveId of ordered) {
    if (out.length >= size) break
    const prompts = shuffle(
      RECALL_PROMPTS.filter((p) => p.objectiveId === objectiveId),
      `${opts.seed}-${objectiveId}`,
    )
    const candidate = prompts
      .filter((p) => {
        const last = h.lastDate.get(p.id)
        if (!last) return true
        const recentlyRight = (h.lastScore.get(p.id) ?? 0) >= MISTAKE_THRESHOLD && daysBetween(last, opts.today) < 2
        return !recentlyRight && last !== opts.today
      })
      .sort((a, b) => {
        const seenA = h.seen.has(a.id) ? 1 : 0
        const seenB = h.seen.has(b.id) ? 1 : 0
        if (seenA !== seenB) return seenA - seenB
        return (h.lastScore.get(a.id) ?? 1) - (h.lastScore.get(b.id) ?? 1)
      })[0]
    if (candidate) out.push(candidate.id)
  }
  return out
}

export function lessonCheckIds(objectiveId: string): string[] {
  return LESSON_BY_OBJECTIVE[objectiveId]?.checks.map((c) => c.id) ?? []
}

// ---------------- Quizzes and mocks ----------------

const HALF_DISTRIBUTION: Record<SectionId, number> = { CD: 5, CS: 7, BPM: 4, RQ: 5, US: 5, UA: 4 }
const QUICK_DISTRIBUTION: Record<SectionId, number> = { CD: 2, CS: 2, BPM: 1, RQ: 2, US: 2, UA: 1 }

function sectionQuestions(
  sectionId: SectionId,
  n: number,
  attempts: Attempt[],
  today: string,
  seed: string,
  mockMode: boolean,
  exclude: Set<string>,
): Question[] {
  const h = history(attempts)
  const ids = objectivesForSection(sectionId).map((o) => o.id)
  const candidates = QUESTIONS.filter(
    (q) => ids.includes(q.objectiveId) && !exclude.has(q.id) && (mockMode || eligibleForPractice(q, h)),
  )
  const ranked = rankQuestions(candidates, h, today, seed)
  // Mocks prefer unseen reserved questions, then other unseen, then least-recently-seen.
  const tier = (q: Question) => (mockMode ? (!h.seen.has(q.id) ? (q.pool === 'mock' ? 0 : 1) : 2) : tierOf(q, h, today))
  const out: Question[] = []
  for (const t of [0, 1, 2]) {
    // Within a tier, spread across the section's objectives (round robin).
    const byObj = new Map<string, Question[]>()
    for (const q of ranked.filter((x) => tier(x) === t)) byObj.set(q.objectiveId, [...(byObj.get(q.objectiveId) ?? []), q])
    while (out.length < n && [...byObj.values()].some((l) => l.length)) {
      for (const list of byObj.values()) {
        if (out.length >= n) break
        const q = list.shift()
        if (q) out.push(q)
      }
    }
  }
  return out
}

export interface QuizSpec {
  kind: QuizKind
  sectionId?: SectionId
  objectiveIds?: string[]
}

export function buildQuizQuestions(
  spec: QuizSpec,
  ctx: { attempts: Attempt[]; stats: AllStats; mistakes: MistakeEntry[]; today: string; seed: string },
): string[] {
  const { attempts, today, seed } = ctx
  const exclude = new Set<string>()
  const fromDistribution = (dist: Record<SectionId, number>, mockMode: boolean) => {
    const out: string[] = []
    for (const [sec, n] of Object.entries(dist) as [SectionId, number][]) {
      for (const q of sectionQuestions(sec, n, attempts, today, `${seed}-${sec}`, mockMode, exclude)) {
        out.push(q.id)
        exclude.add(q.id)
      }
    }
    return shuffle(out, `${seed}-order`)
  }
  switch (spec.kind) {
    case 'diagnostic':
      return shuffle(DIAGNOSTIC_IDS, `${seed}-diag`)
    case 'quick':
      return fromDistribution(QUICK_DISTRIBUTION, false)
    case 'section':
      return sectionQuestions(spec.sectionId!, 10, attempts, today, seed, false, exclude).map((q) => q.id)
    case 'weak': {
      const weakest = [...ctx.stats.objectives].sort((a, b) => a.estimate - b.estimate).slice(0, 3)
      return pickPracticeQuestions({
        objectiveIds: spec.objectiveIds ?? weakest.map((o) => o.objective.id),
        n: 10,
        attempts,
        today,
        seed,
      }).map((q) => q.id)
    }
    case 'mistakes':
      return buildMistakeReview(ctx.mistakes, attempts, today, seed)
    case 'mock-full':
      return fromDistribution(MOCK_DISTRIBUTION, true)
    case 'mock-half':
    case 'readiness':
      return fromDistribution(HALF_DISTRIBUTION, true)
  }
}

/**
 * "Review my mistakes": for the highest-priority open mistakes, prefer a different
 * question on the same objective sharing a concept tag (a new scenario); fall back to
 * retrying the original question (shown as a retry).
 */
export function buildMistakeReview(mistakes: MistakeEntry[], attempts: Attempt[], today: string, seed: string): string[] {
  const h = history(attempts)
  const open = mistakes.filter((m) => !m.resolved).sort((a, b) => mistakePriority(b, today) - mistakePriority(a, today))
  const out: string[] = []
  const used = new Set<string>()
  for (const m of open) {
    if (out.length >= 10) break
    const fresh = QUESTIONS.filter(
      (q) =>
        q.objectiveId === m.objectiveId &&
        q.id !== m.itemId &&
        !used.has(q.id) &&
        eligibleForPractice(q, h) &&
        (m.tags.length === 0 || q.tags.some((t) => m.tags.includes(t))),
    )
    const freshUnseen = shuffle(fresh, `${seed}-${m.itemId}`).sort((a, b) => Number(h.seen.has(a.id)) - Number(h.seen.has(b.id)))
    const pick = freshUnseen.find((q) => !h.seen.has(q.id)) ?? (m.kind === 'mcq' ? QUESTION_BY_ID[m.itemId] : freshUnseen[0])
    if (pick && !used.has(pick.id)) {
      out.push(pick.id)
      used.add(pick.id)
    }
  }
  return out
}

export function quizTimeLimitMs(kind: QuizKind, n: number): number | undefined {
  if (kind === 'mock-full') return 105 * 60_000
  if (kind === 'mock-half' || kind === 'readiness') return Math.round((105 / 60) * n) * 60_000
  return undefined
}
