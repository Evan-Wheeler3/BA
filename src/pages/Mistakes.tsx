import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OBJECTIVES, OBJECTIVE_BY_ID, SECTIONS } from '../domain/blueprint'
import type { SectionId } from '../domain/types'
import { formatDate } from '../engine/dates'
import { mistakePriority } from '../engine/mistakes'
import { createQuiz, dismissMistake, setNote } from '../state/actions'
import { useDerived } from '../state/derived'
import { Badge, Button, Card, PageHeader } from '../ui/components'
import { SECTION_COLORS, cx } from '../ui/style'

type Sort = 'priority' | 'recent' | 'frequency'

export default function MistakesPage() {
  const d = useDerived()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<SectionId | ''>('')
  const [objective, setObjective] = useState('')
  const [sort, setSort] = useState<Sort>('priority')
  const [showResolved, setShowResolved] = useState(false)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return d.mistakes
      .filter((m) => showResolved || !m.resolved)
      .filter((m) => !section || m.sectionId === section)
      .filter((m) => !objective || m.objectiveId === objective)
      .filter((m) => !q || [m.questionText, m.correctAnswer, m.principle, m.yourAnswer, d.state.notes[m.itemId] ?? ''].some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) =>
        sort === 'recent' ? (a.lastDate < b.lastDate ? 1 : -1) : sort === 'frequency' ? b.count - a.count : mistakePriority(b, d.today) - mistakePriority(a, d.today),
      )
  }, [d.mistakes, d.state.notes, d.today, query, section, objective, sort, showResolved])

  const open = d.mistakes.filter((m) => !m.resolved).length
  const repeated = d.mistakes.filter((m) => !m.resolved && m.count > 1).length
  const confident = d.mistakes.filter((m) => !m.resolved && m.confidentError).length

  return (
    <div>
      <PageHeader title="Mistake notebook" subtitle={`${open} open · ${repeated} repeated · ${confident} confident errors`} />
      <Button
        size="lg"
        className="mb-4 w-full"
        disabled={!open}
        onClick={() => {
          const q = createQuiz('mistakes')
          if (q) navigate(`/quiz/${q.id}`)
        }}
      >
        Review my mistakes
      </Button>
      <p className="-mt-2 mb-4 text-xs text-slate-500">Picks the concepts most likely to raise your score: exam weight × repetition × confident errors × due date. Uses fresh scenarios on the same concept where possible.</p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions, answers, notes…"
          className="min-h-11 rounded-xl bg-white px-3 ring-1 ring-slate-300 sm:col-span-2 dark:bg-slate-900 dark:ring-slate-700"
          aria-label="Search mistakes"
        />
        <select value={section} onChange={(e) => { setSection(e.target.value as SectionId | ''); setObjective('') }} className="min-h-11 rounded-xl bg-white px-2 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700" aria-label="Filter by section">
          <option value="">All sections</option>
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={objective} onChange={(e) => setObjective(e.target.value)} className="min-h-11 rounded-xl bg-white px-2 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700" aria-label="Filter by objective">
          <option value="">All objectives</option>
          {OBJECTIVES.filter((o) => !section || o.sectionId === section).map((o) => (
            <option key={o.id} value={o.id}>
              {o.id} — {o.title}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-xl bg-white px-2 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700" aria-label="Sort">
          <option value="priority">Sort: score impact</option>
          <option value="frequency">Sort: most repeated</option>
          <option value="recent">Sort: most recent</option>
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="size-4 accent-brand-600" />
          Show resolved
        </label>
      </div>

      {list.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">{d.mistakes.length ? 'No mistakes match these filters.' : 'Wrong or incomplete answers will appear here automatically.'}</p>
        </Card>
      )}
      <div className="space-y-3">
        {list.map((m) => (
          <Card key={m.itemId}>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className={cx('h-4 w-1 rounded-full', SECTION_COLORS[m.sectionId].bar)} />
              <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {m.objectiveId} · {OBJECTIVE_BY_ID[m.objectiveId].title}
              </Badge>
              {m.count > 1 && <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200">×{m.count}</Badge>}
              {m.confidentError && <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Confident but wrong</Badge>}
              {m.resolved ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Resolved</Badge>
              ) : m.improving ? (
                <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200">Improving</Badge>
              ) : (
                <Badge className={m.nextReview <= d.today ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
                  Review {m.nextReview <= d.today ? 'due' : formatDate(m.nextReview)}
                </Badge>
              )}
            </div>
            <p className="text-[15px] leading-relaxed">{m.questionText}</p>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="rounded-lg bg-rose-50 p-2.5 dark:bg-rose-950/30">
                <dt className="text-xs font-semibold uppercase text-rose-700 dark:text-rose-300">Your answer</dt>
                <dd className="whitespace-pre-line">{m.yourAnswer}</dd>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-950/30">
                <dt className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Correct answer</dt>
                <dd>{m.correctAnswer}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Why it was wrong or incomplete</dt>
                <dd>{m.whyWrong}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Principle to remember</dt>
                <dd className="font-medium">{m.principle}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Corrective exercise</dt>
                <dd>{m.correctiveExercise}</dd>
              </div>
            </dl>
            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase text-slate-500">My note (why I got it wrong)</span>
              <textarea
                defaultValue={d.state.notes[m.itemId] ?? ''}
                onBlur={(e) => setNote(m.itemId, e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg bg-white p-2 text-sm ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
                placeholder="e.g. I picked the solution before confirming the need"
              />
            </label>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                First {formatDate(m.firstDate)} · last {formatDate(m.lastDate)}
              </span>
              <button type="button" className="font-medium underline" onClick={() => dismissMistake(m.itemId, !m.resolved)}>
                {m.resolved ? 'Reopen' : 'Mark resolved'}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
