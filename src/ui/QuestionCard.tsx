import { useState } from 'react'
import { OBJECTIVE_BY_ID, SECTION_BY_ID } from '../domain/blueprint'
import type { Confidence, OptionId, Question } from '../domain/types'
import { isCorrect, requiredSelections } from '../engine/grading'
import { Badge, Button, Segmented } from './components'
import { CONFIDENCE_OPTIONS, cx } from './style'
import { CheckIcon, XIcon } from './icons'

/** Keyed by question id at every call site, so local state resets per question. */
interface Props {
  question: Question
  /** answer: interactive with feedback after submit; exam: select only; review: read-only feedback. */
  mode: 'answer' | 'exam' | 'review'
  selected?: OptionId[]
  onSelect?: (sel: OptionId[]) => void
  onSubmit?: (sel: OptionId[], confidence?: Confidence) => void
  askConfidence?: boolean
  confidence?: Confidence
  onConfidence?: (c: Confidence) => void
  seenBefore?: boolean
  /** When resuming, an already-recorded answer puts the card straight into feedback. */
  existing?: OptionId[]
  footer?: React.ReactNode
  index?: number
  total?: number
}

export function QuestionCard(props: Props) {
  const { question, mode } = props
  const need = requiredSelections(question)
  const [localSel, setLocalSel] = useState<OptionId[]>(props.existing ?? [])
  const [localConf, setLocalConf] = useState<Confidence | undefined>(undefined)
  const [submitted, setSubmitted] = useState<boolean>(!!props.existing)

  const selected = mode === 'answer' ? localSel : (props.selected ?? [])
  const showFeedback = mode === 'review' || (mode === 'answer' && submitted)
  const confidence = mode === 'answer' ? localConf : props.confidence

  function toggle(id: OptionId) {
    if (showFeedback) return
    let next: OptionId[]
    if (need === 1) next = [id]
    else next = selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < need ? [...selected, id] : selected
    if (mode === 'answer') setLocalSel(next)
    else props.onSelect?.(next)
  }

  function submit() {
    setSubmitted(true)
    props.onSubmit?.(localSel, localConf)
  }

  const correct = isCorrect(question, selected)
  const obj = OBJECTIVE_BY_ID[question.objectiveId]
  const section = obj ? SECTION_BY_ID[obj.sectionId] : undefined
  const canSubmit = selected.length === need && (!props.askConfidence || !!localConf)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {props.index !== undefined && props.total !== undefined && (
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            Question {props.index + 1} of {props.total}
          </span>
        )}
        {section && <span>· {section.name}</span>}
        {props.seenBefore && (
          <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Retry — seen before</Badge>
        )}
        {need > 1 && <Badge className="bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100">Choose {need}</Badge>}
      </div>
      <p className="whitespace-pre-line text-[17px] leading-relaxed">{question.stem}</p>

      <fieldset className="mt-4 space-y-2.5" disabled={showFeedback}>
        <legend className="sr-only">Answer options</legend>
        {question.options.map((o) => {
          const isSel = selected.includes(o.id)
          const isRight = question.correct.includes(o.id)
          return (
            <label
              key={o.id}
              className={cx(
                'flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 ring-1 transition-colors',
                !showFeedback && isSel && 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-950/50',
                !showFeedback && !isSel && 'bg-white ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-700 dark:hover:bg-slate-800',
                showFeedback && isRight && 'bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950/40',
                showFeedback && !isRight && isSel && 'bg-rose-50 ring-2 ring-rose-500 dark:bg-rose-950/40',
                showFeedback && !isRight && !isSel && 'bg-white opacity-80 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800',
              )}
            >
              <input
                type={need === 1 ? 'radio' : 'checkbox'}
                name={`q-${question.id}`}
                className="mt-1 size-4 accent-brand-600"
                checked={isSel}
                onChange={() => toggle(o.id)}
              />
              <span className="flex-1">
                <span className="mr-1.5 font-semibold uppercase text-slate-400">{o.id}.</span>
                {o.text}
              </span>
              {showFeedback && isRight && <CheckIcon className="mt-0.5 shrink-0 text-emerald-600" />}
              {showFeedback && !isRight && isSel && <XIcon className="mt-0.5 shrink-0 text-rose-600" />}
            </label>
          )
        })}
      </fieldset>

      {mode === 'exam' && props.askConfidence !== false && props.onConfidence && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400">Confidence (optional)</span>
          <Segmented label="Confidence" value={confidence} options={CONFIDENCE_OPTIONS} onChange={props.onConfidence} />
        </div>
      )}

      {mode === 'answer' && !submitted && (
        <div className="mt-4 space-y-3">
          {props.askConfidence && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-400">How confident are you?</span>
              <Segmented label="Confidence" value={localConf} options={CONFIDENCE_OPTIONS} onChange={setLocalConf} />
            </div>
          )}
          <Button className="w-full sm:w-auto" size="lg" disabled={!canSubmit} onClick={submit}>
            Submit answer
          </Button>
          {need > 1 && selected.length !== need && <p className="text-xs text-slate-500">Select {need} options.</p>}
        </div>
      )}

      {showFeedback && <Feedback question={question} selected={selected} correct={correct} />}
      {props.footer && <div className="mt-5">{props.footer}</div>}
    </div>
  )
}

export function Feedback({ question, selected, correct }: { question: Question; selected: OptionId[]; correct: boolean }) {
  const obj = OBJECTIVE_BY_ID[question.objectiveId]
  return (
    <div className="mt-5 space-y-3" aria-live="polite">
      <div
        className={cx(
          'flex items-center gap-2 rounded-xl px-3 py-2.5 font-semibold',
          correct ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200',
        )}
      >
        {correct ? <CheckIcon /> : <XIcon />}
        {correct ? 'Correct' : selected.length ? 'Incorrect' : 'Not answered'}
      </div>
      <div className="rounded-xl bg-slate-50 p-3.5 text-[15px] leading-relaxed dark:bg-slate-800/60">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Why the answer is best</div>
        {question.explanation}
      </div>
      <div className="rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed dark:bg-slate-800/60">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Why the others are weaker</div>
        <ul className="space-y-1.5">
          {question.options
            .filter((o) => !question.correct.includes(o.id))
            .map((o) => (
              <li key={o.id} className={cx(selected.includes(o.id) && 'font-medium')}>
                <span className="font-semibold uppercase text-slate-400">{o.id}.</span> {question.distractors[o.id]}
                {selected.includes(o.id) && <span className="ml-1 text-rose-600 dark:text-rose-400">(your choice)</span>}
              </li>
            ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200">Objective {obj?.id}: {obj?.title}</Badge>
        <Badge className="bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Remember: {question.principle}</Badge>
      </div>
    </div>
  )
}
