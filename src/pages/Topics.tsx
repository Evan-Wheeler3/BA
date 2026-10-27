import { Link, useNavigate, useParams } from 'react-router-dom'
import { OBJECTIVE_BY_ID, SECTIONS, objectivesForSection } from '../domain/blueprint'
import { LESSON_BY_OBJECTIVE, QUESTIONS, RESOURCES } from '../domain/content'
import { formatDate } from '../engine/dates'
import { activeSession, createQuiz, startSession } from '../state/actions'
import { useDerived } from '../state/derived'
import { Button, Card, LevelBadge, Notice, PageHeader, ProgressBar, SectionTitle } from '../ui/components'
import { pct, SECTION_COLORS, cx } from '../ui/style'
import { ChevronRight } from '../ui/icons'
import { LessonView, ResourceCard } from '../ui/LessonView'

export default function TopicsPage() {
  const d = useDerived()
  return (
    <div>
      <PageHeader title="Topic library" subtitle="Every exam objective, with your mastery evidence and the lesson for it." />
      {SECTIONS.map((s) => (
        <section key={s.id} className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <span className={cx('h-5 w-1.5 rounded-full', SECTION_COLORS[s.id].bar)} />
            <h2 className="font-semibold">{s.name}</h2>
            <span className="text-xs text-slate-500">
              {Math.round(s.weight * 100)}% · last exam {s.baseline.correct}/{s.baseline.total}
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            {objectivesForSection(s.id).map((o) => {
              const st = d.stats.byId[o.id]
              return (
                <Link key={o.id} to={`/topics/${o.id}`} className="flex min-h-16 items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">{o.id}</span>
                      <span className="truncate font-medium">{o.title}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ProgressBar value={st.estimate} className="max-w-40" barClass={SECTION_COLORS[s.id].bar} />
                      <span className="text-xs text-slate-500">{pct(st.estimate)}</span>
                    </div>
                  </div>
                  <LevelBadge level={st.level} />
                  <ChevronRight size={18} className="text-slate-400" />
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function TopicDetailPage() {
  const { id = '' } = useParams()
  const d = useDerived()
  const navigate = useNavigate()
  const obj = OBJECTIVE_BY_ID[id]
  if (!obj) return <PageHeader title="Topic not found" />
  const st = d.stats.byId[id]
  const lesson = LESSON_BY_OBJECTIVE[id]
  const bank = QUESTIONS.filter((q) => q.objectiveId === id).length
  return (
    <div>
      <Link to="/topics" className="mb-2 inline-block text-sm text-brand-700 dark:text-brand-300">
        ← Topics
      </Link>
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">{obj.description}</p>
          <LevelBadge level={st.level} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Fact label="Mastery" value={pct(st.mastery)} />
          <Fact label="Estimate" value={pct(st.estimate)} />
          <Fact label="Attempts" value={`${st.attempts} (${st.distinctItems} distinct)`} />
          <Fact label="Accuracy" value={pct(st.accuracy)} />
          <Fact label="Last result" value={st.lastResult === null ? '—' : pct(st.lastResult)} />
          <Fact label="Last studied" value={st.lastStudied ? formatDate(st.lastStudied) : '—'} />
          <Fact label="Next review" value={st.srs.nextReview ? formatDate(st.srs.nextReview) : '—'} />
          <Fact label="Confidence" value={st.avgConfidence === null ? '—' : pct(st.avgConfidence)} />
        </dl>
        {st.commonMistakes.length > 0 && <p className="mt-2 text-sm">Common mistakes: {st.commonMistakes.join(', ')}</p>}
        {st.confidentErrors > 0 && <Notice tone="warn" className="mt-2">{st.confidentErrors} confident wrong answer(s) — likely misconception. This topic is prioritised in recall.</Notice>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              if (activeSession() && !confirm('You have a session in progress. Resume it instead?')) return
              startSession(id)
              navigate('/session')
            }}
          >
            Study this in a session
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const q = createQuiz('weak', { objectiveIds: [id] })
              if (q) navigate(`/quiz/${q.id}`)
            }}
          >
            Topic quiz ({bank} questions)
          </Button>
        </div>
      </Card>
      <LessonView lesson={lesson} />
      <p className="mt-3 text-sm text-slate-500">The lesson’s knowledge check runs inside a study session so it counts toward your schedule.</p>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}

export function ResourcesPage() {
  const official = RESOURCES.filter((r) => r.official)
  const third = RESOURCES.filter((r) => !r.official)
  return (
    <div>
      <PageHeader title="Resource library" subtitle="Direct links to the exact lesson for each objective. Official sources first." />
      <Notice tone="info" className="mb-4">
        Verification status is shown on every link. On {RESOURCES[0].lastChecked} the coach could not open Salesforce pages directly (network restrictions while building), so links were
        confirmed against search-engine index entries instead. Nothing is labelled “Verified” unless it was opened. Run <code>npm run check-links</code> to re-check from your own machine.
      </Notice>
      <SectionTitle>Official Salesforce ({official.length})</SectionTitle>
      <div className="space-y-3">
        {official.map((r) => (
          <ResourceCard key={r.id} resource={r} />
        ))}
      </div>
      <SectionTitle>Third-party supplements ({third.length})</SectionTitle>
      <div className="space-y-3">
        {third.map((r) => (
          <ResourceCard key={r.id} resource={r} />
        ))}
      </div>
    </div>
  )
}
