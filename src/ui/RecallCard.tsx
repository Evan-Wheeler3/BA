import { useState } from 'react'
import { OBJECTIVE_BY_ID, SECTION_BY_ID } from '../domain/blueprint'
import type { Attempt, Confidence, RecallPrompt } from '../domain/types'
import { aiGradeRecall, aiGradingAvailable } from '../cloud/ai'
import { RUBRIC_LABELS, gradeRecall } from '../engine/grading'
import { adjustRecallRubric, recordRecallAttempt } from '../state/actions'
import { Badge, Button, Segmented } from './components'
import { CONFIDENCE_OPTIONS, cx } from './style'
import { CheckIcon, XIcon } from './icons'

const KIND_LABEL: Record<RecallPrompt['kind'], string> = {
  short: 'Short answer',
  scenario: 'Scenario',
  difference: 'Explain the difference',
  'first-step': 'What would you do first?',
}

interface Props {
  prompt: RecallPrompt
  sessionId?: string
  askConfidence: boolean
  aiEnabled: boolean
  existing?: Attempt
  onDone: () => void
  index: number
  total: number
}

export function RecallCard({ prompt, sessionId, askConfidence, aiEnabled, existing, onDone, index, total }: Props) {
  const [text, setText] = useState(existing?.answerText ?? '')
  const [confidence, setConfidence] = useState<Confidence | undefined>(existing?.confidence)
  const [attempt, setAttempt] = useState<Attempt | undefined>(existing)
  const [ai, setAi] = useState<{ feedback: string; correct: string[]; missing: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const obj = OBJECTIVE_BY_ID[prompt.objectiveId]
  const grade = gradeRecall(prompt, attempt?.answerText ?? text)

  async function submit() {
    setBusy(true)
    let rubric: number = grade.rubric
    let gradedBy: Attempt['gradedBy'] = 'keywords'
    if (aiEnabled && aiGradingAvailable() && text.trim().length > 0) {
      const res = await aiGradeRecall(prompt, text)
      if (res) {
        rubric = res.rubric
        gradedBy = 'ai'
        setAi({ feedback: res.feedback, correct: res.correctPoints, missing: res.missingPoints })
      }
    }
    const a = recordRecallAttempt({ promptId: prompt.id, answerText: text, rubric, autoRubric: rubric, gradedBy, confidence, sessionId })
    setAttempt(a)
    setBusy(false)
  }

  function adjust(r: number) {
    if (!attempt) return
    adjustRecallRubric(attempt.id, r)
    setAttempt({ ...attempt, rubric: r, score: r / 4, gradedBy: 'self' })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          Prompt {index + 1} of {total}
        </span>
        <span>· {SECTION_BY_ID[obj.sectionId].name}</span>
        <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{KIND_LABEL[prompt.kind]}</Badge>
      </div>
      <p className="text-[17px] font-medium leading-relaxed">{prompt.prompt}</p>

      {!attempt && (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="sr-only">Your answer</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Answer from memory in your own words — no notes."
              className="w-full rounded-xl border-0 bg-white p-3 text-base ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-500 dark:bg-slate-900 dark:ring-slate-700"
            />
          </label>
          {askConfidence && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-400">How confident are you?</span>
              <Segmented label="Confidence" value={confidence} options={CONFIDENCE_OPTIONS} onChange={setConfidence} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={submit} disabled={busy || (askConfidence && !confidence) || text.trim().length === 0}>
              {busy ? 'Grading…' : 'Submit answer'}
            </Button>
            <Button variant="ghost" onClick={() => setText((t) => t || "I don't remember")} disabled={busy}>
              I don’t know
            </Button>
          </div>
        </div>
      )}

      {attempt && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Your answer</div>
            <p className="whitespace-pre-line">{attempt.answerText || '(blank)'}</p>
          </div>
          <div
            className={cx(
              'rounded-xl p-3',
              (attempt.rubric ?? 0) >= 3 ? 'bg-emerald-100 dark:bg-emerald-950/60' : (attempt.rubric ?? 0) === 2 ? 'bg-amber-100 dark:bg-amber-950/60' : 'bg-rose-100 dark:bg-rose-950/60',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold">{attempt.rubric}/4</span>
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {attempt.gradedBy === 'ai' ? 'AI-graded' : attempt.gradedBy === 'self' ? 'Self-adjusted' : 'Auto-graded (key-point matching)'}
              </span>
            </div>
            <div className="text-sm">{RUBRIC_LABELS[attempt.rubric ?? 0]}</div>
          </div>

          {ai?.feedback && <p className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-950/40">{ai.feedback}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">What you got right</div>
              <ul className="space-y-1 text-sm">
                {(ai ? ai.correct : grade.matched.map((k) => k.label)).map((l) => (
                  <li key={l} className="flex gap-1.5">
                    <CheckIcon size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    {l}
                  </li>
                ))}
                {(ai ? ai.correct : grade.matched).length === 0 && <li className="text-slate-500">No key points detected.</li>}
              </ul>
            </div>
            <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">Missing or incorrect</div>
              <ul className="space-y-1 text-sm">
                {(ai ? ai.missing : grade.missed.map((k) => k.label)).map((l) => (
                  <li key={l} className="flex gap-1.5">
                    <XIcon size={16} className="mt-0.5 shrink-0 text-rose-600" />
                    {l}
                  </li>
                ))}
                {(ai ? ai.missing : grade.missed).length === 0 && <li className="text-slate-500">Nothing missing.</li>}
              </ul>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 text-[15px] leading-relaxed dark:bg-slate-800/60">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Model answer</div>
            {prompt.modelAnswer}
          </div>

          <div>
            <div className="mb-1.5 text-xs text-slate-500">
              Disagree with the grade? Equivalent wording counts — adjust it honestly:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => adjust(r)}
                  aria-pressed={attempt.rubric === r}
                  title={RUBRIC_LABELS[r]}
                  className={cx(
                    'size-11 rounded-xl text-sm font-semibold ring-1',
                    attempt.rubric === r ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-300 dark:bg-slate-900 dark:ring-slate-700',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <Button size="lg" className="w-full sm:w-auto" onClick={onDone}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
