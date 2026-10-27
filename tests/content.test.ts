import { describe, expect, it } from 'vitest'
import { MOCK_DISTRIBUTION, OBJECTIVES, OBJECTIVE_BY_ID, SECTIONS } from '../src/domain/blueprint'
import {
  CHECK_QUESTIONS,
  DIAGNOSTIC_IDS,
  LESSONS,
  QUESTIONS,
  RECALL_PROMPTS,
  RESOURCES,
  RESOURCE_BY_ID,
} from '../src/domain/content'
import { gradeRecall, normalise } from '../src/engine/grading'

const ALL = [...QUESTIONS, ...CHECK_QUESTIONS]

describe('blueprint', () => {
  it('section weights sum to 100%', () => {
    expect(SECTIONS.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 5)
  })
  it('baseline matches the 37/60 previous result', () => {
    expect(SECTIONS.reduce((s, x) => s + x.baseline.correct, 0)).toBe(37)
    expect(SECTIONS.reduce((s, x) => s + x.baseline.total, 0)).toBe(60)
  })
  it('mock distribution totals 60 and matches section weights', () => {
    expect(Object.values(MOCK_DISTRIBUTION).reduce((a, b) => a + b, 0)).toBe(60)
    for (const s of SECTIONS) expect(Math.abs(MOCK_DISTRIBUTION[s.id] - s.weight * 60)).toBeLessThan(1)
  })
})

describe('question bank integrity', () => {
  it('has unique ids', () => {
    const ids = ALL.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no duplicate stems', () => {
    const stems = ALL.map((q) => q.stem.trim().toLowerCase())
    expect(new Set(stems).size).toBe(stems.length)
  })

  it.each(ALL.map((q) => [q.id, q] as const))('%s is well-formed', (_id, q) => {
    expect(OBJECTIVE_BY_ID[q.objectiveId]).toBeDefined()
    expect(q.options.length).toBeGreaterThanOrEqual(4)
    expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length)
    expect(new Set(q.options.map((o) => o.text.toLowerCase())).size).toBe(q.options.length)
    // every correct id exists
    for (const c of q.correct) expect(q.options.some((o) => o.id === c)).toBe(true)
    // single-answer questions have exactly one correct answer;
    // multi-select questions say "Choose N" and N matches the key
    const choose = q.stem.match(/Choose (\d)/)
    if (choose) expect(q.correct.length).toBe(Number(choose[1]))
    else expect(q.correct.length).toBe(1)
    // every wrong option has a rationale, and no correct option has one
    for (const o of q.options) {
      if (q.correct.includes(o.id)) expect(q.distractors[o.id]).toBeUndefined()
      else expect(q.distractors[o.id]?.length ?? 0).toBeGreaterThan(5)
    }
    expect(q.explanation.length).toBeGreaterThan(20)
    expect(q.principle.length).toBeGreaterThan(5)
  })

  it('covers every objective with at least 4 exam-style questions', () => {
    for (const o of OBJECTIVES) {
      expect(QUESTIONS.filter((q) => q.objectiveId === o.id).length, o.id).toBeGreaterThanOrEqual(4)
    }
  })

  it('has at least 20 questions per section (target was 10)', () => {
    for (const s of SECTIONS) {
      const ids = OBJECTIVES.filter((o) => o.sectionId === s.id).map((o) => o.id)
      expect(QUESTIONS.filter((q) => ids.includes(q.objectiveId)).length, s.id).toBeGreaterThanOrEqual(20)
    }
  })

  it('reserves enough fresh questions for one full-length mock per the official weighting', () => {
    for (const s of SECTIONS) {
      const ids = OBJECTIVES.filter((o) => o.sectionId === s.id).map((o) => o.id)
      const mockPool = QUESTIONS.filter((q) => q.pool === 'mock' && ids.includes(q.objectiveId)).length
      expect(mockPool, s.id).toBeGreaterThanOrEqual(MOCK_DISTRIBUTION[s.id])
    }
  })

  it('balances the correct-answer position (no letter above 40%)', () => {
    const single = QUESTIONS.filter((q) => q.correct.length === 1)
    const counts: Record<string, number> = {}
    for (const q of single) counts[q.correct[0]] = (counts[q.correct[0]] ?? 0) + 1
    for (const n of Object.values(counts)) expect(n / single.length).toBeLessThan(0.4)
  })

  it('does not give away answers by length (correct option strictly longest or shortest in ≤ 35%)', () => {
    const single = QUESTIONS.filter((q) => q.correct.length === 1)
    const share = (cmp: (correctLen: number, otherLen: number) => boolean) =>
      single.filter((q) => {
        const c = q.options.find((o) => o.id === q.correct[0])!.text.length
        return q.options.every((o) => o.id === q.correct[0] || cmp(c, o.text.length))
      }).length / single.length
    expect(share((c, o) => o < c)).toBeLessThanOrEqual(0.35)
    expect(share((c, o) => o > c)).toBeLessThanOrEqual(0.35)
  })

  it('diagnostic covers all six sections with 3 practice-pool questions each', () => {
    expect(DIAGNOSTIC_IDS.length).toBe(18)
    const qs = QUESTIONS.filter((q) => DIAGNOSTIC_IDS.includes(q.id))
    for (const s of SECTIONS) {
      expect(qs.filter((q) => OBJECTIVE_BY_ID[q.objectiveId].sectionId === s.id).length, s.id).toBe(3)
    }
    expect(qs.every((q) => q.pool === 'practice')).toBe(true)
  })
})

describe('lessons and recall prompts', () => {
  it('every objective has exactly one lesson with a valid primary resource', () => {
    for (const o of OBJECTIVES) {
      const l = LESSONS.filter((x) => x.objectiveId === o.id)
      expect(l.length, o.id).toBe(1)
      expect(RESOURCE_BY_ID[l[0].primary.resourceId], o.id).toBeDefined()
      for (const alt of l[0].alternatives) expect(RESOURCE_BY_ID[alt.resourceId]).toBeDefined()
      expect(l[0].takeaways.length).toBeGreaterThanOrEqual(3)
      expect(l[0].takeaways.length).toBeLessThanOrEqual(5)
      expect(l[0].checks.length).toBeGreaterThanOrEqual(2)
      for (const c of l[0].checks) expect(c.objectiveId).toBe(o.id)
    }
  })

  it('every objective has at least 3 recall prompts with unique ids', () => {
    const ids = RECALL_PROMPTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const o of OBJECTIVES) expect(RECALL_PROMPTS.filter((p) => p.objectiveId === o.id).length).toBeGreaterThanOrEqual(3)
  })

  it.each(RECALL_PROMPTS.map((p) => [p.id, p] as const))('%s model answer scores ≥ 3 on its own rubric', (_id, p) => {
    expect(gradeRecall(p, p.modelAnswer).rubric).toBeGreaterThanOrEqual(3)
  })

  it.each(RECALL_PROMPTS.map((p) => [p.id, p] as const))('%s gives 0 for an irrelevant answer', (_id, p) => {
    expect(gradeRecall(p, 'I really have no idea at all about this one, sorry').rubric).toBeLessThanOrEqual(1)
  })
})

describe('resources', () => {
  it('uses https, unique ids, and never claims an unopened page was reviewed', () => {
    expect(new Set(RESOURCES.map((r) => r.id)).size).toBe(RESOURCES.length)
    for (const r of RESOURCES) {
      expect(r.url.startsWith('https://')).toBe(true)
      expect(r.status).not.toBe('reviewed')
      expect(r.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
  it('labels third-party resources as unofficial', () => {
    for (const r of RESOURCES) {
      const thirdParty = /third party/i.test(r.publisher)
      expect(r.official).toBe(!thirdParty)
    }
  })
})

describe('normalise', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalise("It's the PO's call!")).toEqual(['its', 'the', 'pos', 'call'])
  })
})
