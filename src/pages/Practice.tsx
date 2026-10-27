import { Link, useNavigate } from 'react-router-dom'
import { EXAM_FACTS, OBJECTIVE_BY_ID, SECTIONS } from '../domain/blueprint'
import { DIAGNOSTIC_IDS, QUESTIONS } from '../domain/content'
import type { QuizKind, SectionId } from '../domain/types'
import { formatDate, formatDuration } from '../engine/dates'
import { mockResults } from '../engine/readiness'
import { createQuiz, openQuiz } from '../state/actions'
import { useDerived } from '../state/derived'
import { Button, Card, Notice, PageHeader, SectionTitle } from '../ui/components'
import { pct, SECTION_COLORS, cx } from '../ui/style'
import { history } from '../engine/selection'

function useStartQuiz() {
  const navigate = useNavigate()
  return (kind: QuizKind, opts?: { sectionId?: SectionId; objectiveIds?: string[] }) => {
    const existing = openQuiz(kind)
    if (existing && kind !== 'section' && kind !== 'weak') {
      navigate(`/quiz/${existing.id}`)
      return
    }
    const q = createQuiz(kind, opts)
    if (q) navigate(`/quiz/${q.id}`)
    else alert('No questions available for this selection yet.')
  }
}

export function DiagnosticPage() {
  const start = useStartQuiz()
  const d = useDerived()
  const done = d.state.quizzes.filter((q) => q.kind === 'diagnostic' && q.submittedAt)
  return (
    <div>
      <PageHeader title="Diagnostic" subtitle={`${DIAGNOSTIC_IDS.length} questions · about 15 minutes · all six sections`} />
      <Card>
        <p className="text-[15px] leading-relaxed">
          Your August result (37/60) is loaded as a starting point, but two months away from study changes what you remember. This short diagnostic measures retention now: three original
          scenario questions per section, answered exam-style with no feedback until you submit.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>Don’t look anything up — guessing honestly gives the best plan.</li>
          <li>Mark your confidence if you can; confident wrong answers get extra review.</li>
          <li>18 questions is a small sample: it steers early priorities, it doesn’t decide mastery.</li>
        </ul>
        <Button size="lg" className="mt-4 w-full" onClick={() => start('diagnostic')}>
          {openQuiz('diagnostic') ? 'Resume diagnostic' : done.length ? 'Retake diagnostic' : 'Start diagnostic'}
        </Button>
      </Card>
      {done.length > 0 && (
        <Notice tone="info" className="mt-4">
          You completed the diagnostic on {formatDate(done[0].date)}. Retaking uses the same 18 questions, so a second score mostly measures memory of those items.
        </Notice>
      )}
    </div>
  )
}

export default function PracticePage() {
  const start = useStartQuiz()
  const d = useDerived()
  const openMistakes = d.mistakes.filter((m) => !m.resolved).length
  const weakest = [...d.stats.objectives].sort((a, b) => a.estimate - b.estimate).slice(0, 3)
  const seen = history(d.state.attempts).seen
  const inProgress = d.state.quizzes.filter((q) => !q.submittedAt && !q.kind.startsWith('mock') && q.kind !== 'readiness')
  return (
    <div>
      <PageHeader title="Practice" subtitle="Original exam-style questions with explanations after every answer." />
      {inProgress.length > 0 && (
        <Notice tone="info" className="mb-4">
          You have {inProgress.length} quiz{inProgress.length > 1 ? 'zes' : ''} in progress:{' '}
          {inProgress.map((q, i) => (
            <Link key={q.id} to={`/quiz/${q.id}`} className="font-semibold underline">
              {i ? ', ' : ''}
              {q.title}
            </Link>
          ))}
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <QuizTile title="Review my mistakes" detail={openMistakes ? `${openMistakes} open mistakes — new scenarios on the same concepts first` : 'No open mistakes yet'} onClick={() => start('mistakes')} disabled={!openMistakes} highlight />
        <QuizTile title="Weak-area quiz" detail={`10 questions on ${weakest.map((w) => w.objective.id).join(', ')}`} onClick={() => start('weak')} />
        <QuizTile title="Quick mixed quiz" detail="10 questions across all six sections" onClick={() => start('quick')} />
        <QuizTile title="Diagnostic" detail="18-question retention check" onClick={() => start('diagnostic')} />
      </div>

      <SectionTitle>Section quizzes</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const sec = d.stats.sections.find((x) => x.sectionId === s.id)!
          const total = QUESTIONS.filter((q) => OBJECTIVE_BY_ID[q.objectiveId].sectionId === s.id).length
          const unseen = QUESTIONS.filter((q) => OBJECTIVE_BY_ID[q.objectiveId].sectionId === s.id && !seen.has(q.id) && q.pool === 'practice').length
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => start('section', { sectionId: s.id })}
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:bg-slate-800"
            >
              <span className={cx('h-10 w-1.5 shrink-0 rounded-full', SECTION_COLORS[s.id].bar)} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.name}</span>
                <span className="block text-xs text-slate-500">
                  {Math.round(s.weight * 100)}% · estimate {pct(sec.estimate)} · {unseen} unseen of {total}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Some questions are held back for mock exams so at least your first mocks are fresh. {QUESTIONS.length} curated questions in total.
      </p>
    </div>
  )
}

function QuizTile({ title, detail, onClick, disabled, highlight }: { title: string; detail: string; onClick: () => void; disabled?: boolean; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'min-h-24 rounded-2xl p-4 text-left ring-1 transition-colors disabled:opacity-50',
        highlight ? 'bg-brand-600 text-white ring-brand-600 hover:bg-brand-700' : 'bg-white ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:bg-slate-800',
      )}
    >
      <div className="font-semibold">{title}</div>
      <div className={cx('mt-1 text-sm', highlight ? 'text-white/85' : 'text-slate-600 dark:text-slate-400')}>{detail}</div>
    </button>
  )
}

export function MockPage() {
  const start = useStartQuiz()
  const d = useDerived()
  const results = mockResults(d.state.quizzes)
  const freshMock = QUESTIONS.filter((q) => q.pool === 'mock' && !history(d.state.attempts).seen.has(q.id)).length
  const open = d.state.quizzes.find((q) => !q.submittedAt && (q.kind.startsWith('mock') || q.kind === 'readiness'))
  return (
    <div>
      <PageHeader title="Mock exams" subtitle="Timed, exam-weighted, answers revealed only after you submit." />
      {open && (
        <Notice tone="warn" className="mb-4">
          An attempt is in progress: <Link className="font-semibold underline" to={`/quiz/${open.id}`}>{open.title}</Link>. Its timer keeps running while you’re away.
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Full mock</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">60 questions · 105 minutes · official section weighting</p>
          <p className="mt-2 text-xs text-slate-500">Best on a weekend — it doesn’t fit a 60-minute weeknight.</p>
          <Button className="mt-3 w-full" onClick={() => start('mock-full')}>
            Start full mock
          </Button>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Half mock</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">30 questions · 53 minutes · same weighting</p>
          <p className="mt-2 text-xs text-slate-500">Fits a weeknight session; two half mocks ≈ one full exam’s coverage.</p>
          <Button className="mt-3 w-full" onClick={() => start('mock-half')}>
            Start half mock
          </Button>
        </Card>
      </div>
      <Notice tone="info" className="mt-4">
        <p>
          Real exam: {EXAM_FACTS.scoredQuestions} scored multiple-choice/multiple-select questions plus up to {EXAM_FACTS.unscoredQuestions} unscored, {EXAM_FACTS.minutes} minutes, pass mark{' '}
          {EXAM_FACTS.passingPercent}%. ({EXAM_FACTS.source})
        </p>
        <p className="mt-2">
          Freshness matters: {freshMock} reserved mock questions are still unseen. Once you’ve seen most of the bank, mock scores overstate readiness — the results table shows how fresh each attempt was.
        </p>
      </Notice>
      <SectionTitle>History</SectionTitle>
      <Card>
        {results.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Date</th>
                <th className="font-medium">Type</th>
                <th className="font-medium">Score</th>
                <th className="font-medium">Fresh</th>
              </tr>
            </thead>
            <tbody>
              {results
                .slice()
                .reverse()
                .map((r) => (
                  <tr key={r.quizId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2">
                      <Link className="underline" to={`/quiz/${r.quizId}`}>
                        {formatDate(r.date)}
                      </Link>
                    </td>
                    <td>{r.kind === 'mock-full' ? 'Full' : r.kind === 'mock-half' ? 'Half' : 'Readiness'}{r.wasPaused ? ' (paused)' : ''}</td>
                    <td className={cx('font-semibold', r.percent >= 0.8 ? 'text-emerald-600' : r.percent >= EXAM_FACTS.passingPercent / 100 ? 'text-amber-600' : 'text-rose-600')}>
                      {r.correct}/{r.total} ({pct(r.percent)})
                    </td>
                    <td>{pct(r.freshness)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">No mock exams yet. The plan schedules half mocks on Nov 16 and 18.</p>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">Time per question on the real exam averages {formatDuration((EXAM_FACTS.minutes * 60_000) / EXAM_FACTS.scoredQuestions)} (min:sec).</p>
    </div>
  )
}
