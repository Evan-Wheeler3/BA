import { Link } from 'react-router-dom'
import { EXAM_FACTS, PROFILE } from '../domain/blueprint'
import { addDays, formatDate } from '../engine/dates'
import { mockResults } from '../engine/readiness'
import { useDerived } from '../state/derived'
import { Card, LevelBadge, Notice, PageHeader, ProgressBar, SectionTitle, Stat } from '../ui/components'
import { cx, pct, SECTION_COLORS } from '../ui/style'
import { CheckIcon, XIcon } from '../ui/icons'

export default function ProgressPage() {
  const d = useDerived()
  const { readiness, stats, state } = d
  const mocks = mockResults(state.quizzes)

  // Weekly MCQ accuracy (last 5 weeks).
  const weeks = Array.from({ length: 5 }, (_, i) => {
    const end = addDays(d.today, -7 * i)
    const start = addDays(end, -6)
    const atts = state.attempts.filter((a) => a.kind === 'mcq' && a.date >= start && a.date <= end)
    return { start, n: atts.length, acc: atts.length ? atts.reduce((s, a) => s + a.score, 0) / atts.length : null }
  }).reverse()

  return (
    <div>
      <PageHeader title="Progress & readiness" subtitle="Three different numbers — none of them is a prediction of your Salesforce score." />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label="Raw practice %" value={pct(readiness.rawPracticePercent)} hint={`last ${readiness.rawPracticeCount} exam-style answers`} />
        <Stat label="Weighted study score" value={pct(readiness.weightedStudyScore)} hint="section estimates × official weights" />
        <Stat label="Exam readiness" value={readiness.headline} hint={readiness.freshMockQuestions ? `${readiness.freshMockQuestions} fresh mock Qs at ${pct(readiness.freshMockAccuracy)}` : 'no mock yet'} />
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold">Readiness checks</h2>
        <ul className="mt-2 space-y-2">
          {readiness.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              {c.ok ? <CheckIcon size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <XIcon size={18} className="mt-0.5 shrink-0 text-rose-500" />}
              <span>
                <span className="font-medium">{c.label}</span> <span className="text-slate-500">— {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <Notice tone={readiness.status === 'ready' ? 'success' : 'info'} className="mt-3">
          {readiness.recommendation}
        </Notice>
        <p className="mt-2 text-xs text-slate-500">
          Official pass mark: {EXAM_FACTS.passingPercent}% (≈ 43–44 of 60). The real exam may include up to {EXAM_FACTS.unscoredQuestions} unscored questions you can’t identify. Previous attempt:{' '}
          {PROFILE.previousAttempt.correct}/{PROFILE.previousAttempt.total}.
        </p>
      </Card>

      <SectionTitle>Mock exams</SectionTitle>
      <Card>
        {mocks.length ? (
          <ul className="space-y-2.5">
            {mocks.map((m) => (
              <li key={m.quizId}>
                <div className="flex justify-between text-sm">
                  <Link to={`/quiz/${m.quizId}`} className="font-medium underline">
                    {formatDate(m.date)} · {m.kind === 'mock-full' ? 'Full' : m.kind === 'mock-half' ? 'Half' : 'Readiness'}
                  </Link>
                  <span>
                    {pct(m.percent)} · {pct(m.freshness)} fresh
                  </span>
                </div>
                <div className="relative mt-1">
                  <ProgressBar value={m.percent} barClass={m.percent >= 0.8 ? 'bg-emerald-500' : m.percent >= 0.72 ? 'bg-amber-500' : 'bg-rose-500'} />
                  <span className="absolute top-[-2px] h-3 w-0.5 bg-slate-900 dark:bg-white" style={{ left: '72%' }} title="Pass mark 72%" />
                  <span className="absolute top-[-2px] h-3 w-0.5 bg-emerald-700" style={{ left: '80%' }} title="Coach target 80%" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No mock exams yet.</p>
        )}
        <p className="mt-2 text-xs text-slate-500">Black tick = 72% pass mark · green tick = 80% coach target.</p>
      </Card>

      <SectionTitle>Weekly accuracy</SectionTitle>
      <Card>
        <ul className="space-y-2">
          {weeks.map((w) => (
            <li key={w.start} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-sm">
              <span className="text-slate-500">{formatDate(w.start)}</span>
              <ProgressBar value={w.acc ?? 0} />
              <span className="text-right tabular-nums">{w.acc === null ? '—' : `${pct(w.acc)} (${w.n})`}</span>
            </li>
          ))}
        </ul>
      </Card>

      <SectionTitle>Objective mastery</SectionTitle>
      <div className="space-y-3">
        {stats.sections.map((sec) => (
          <Card key={sec.sectionId}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cx('h-5 w-1.5 rounded-full', SECTION_COLORS[sec.sectionId].bar)} />
                <h3 className="font-semibold">{sec.name}</h3>
              </div>
              <span className="text-sm">
                {pct(sec.estimate)} <span className="text-xs text-slate-500">(baseline {pct(sec.baseline)})</span>
              </span>
            </div>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-1 py-1 font-medium">Objective</th>
                    <th className="px-1 font-medium">Level</th>
                    <th className="px-1 font-medium">Mastery</th>
                    <th className="px-1 font-medium">Answers</th>
                    <th className="px-1 font-medium">Last</th>
                    <th className="px-1 font-medium">Next review</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.objectives.map((o) => (
                    <tr key={o.objective.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-1 py-2">
                        <Link to={`/topics/${o.objective.id}`} className="underline-offset-2 hover:underline">
                          {o.objective.id} {o.objective.title}
                        </Link>
                      </td>
                      <td className="px-1">
                        <LevelBadge level={o.level} />
                      </td>
                      <td className="px-1 tabular-nums">{pct(o.mastery)}</td>
                      <td className="px-1 tabular-nums">{o.attempts}</td>
                      <td className="px-1">{o.lastStudied ? formatDate(o.lastStudied) : '—'}</td>
                      <td className="px-1">{o.srs.nextReview ? (o.due ? 'due' : formatDate(o.srs.nextReview)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
      <details className="mt-4 rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <summary className="cursor-pointer font-semibold">How these numbers are calculated</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-400">
          <li>Mastery: recency-weighted average of your last 20 results per objective (newest counts most). Levels: Learning &lt; 60%, Developing 60–74%, Nearly ready 75–84%, Strong 85–94%, Demonstrated mastery ≥ 95% over ≥ 10 distinct items including a correct review ≥ 3 days later.</li>
          <li>Estimate: blends mastery with your previous exam section score (discounted 10% for the break), counted as 3 answers’ worth of evidence. Your own answers quickly dominate.</li>
          <li>Weighted study score: section estimates multiplied by the official section weights.</li>
          <li>Spaced repetition: below 60% → review tomorrow; 60–79% → within 1–3 days; ≥ 80% → 1, 3, then growing intervals (capped at 14 days so strong topics are still revisited).</li>
          <li>These are study-management thresholds, not guarantees of exam performance.</li>
        </ul>
      </details>
    </div>
  )
}
