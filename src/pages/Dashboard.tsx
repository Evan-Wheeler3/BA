import { useNavigate } from 'react-router-dom'
import { EXAM_FACTS, OBJECTIVE_BY_ID, PROFILE, SECTION_BY_ID } from '../domain/blueprint'
import { addDays, formatDate, formatMinutes, weekday } from '../engine/dates'
import { isStudyDay } from '../engine/planner'
import { activeSession, createQuiz, openQuiz, sessionElapsed, startSession } from '../state/actions'
import { useDerived } from '../state/derived'
import { Badge, Button, Card, LevelBadge, LinkButton, ProgressBar, Ring, SectionTitle, Stat } from '../ui/components'
import { cx, pct, SECTION_COLORS } from '../ui/style'
import { ExamIcon, PlayIcon, TargetIcon } from '../ui/icons'
import { Link } from 'react-router-dom'

type Action = { title: string; detail: string; cta: string; onClick: () => void; secondary?: { label: string; onClick: () => void } }

export default function Dashboard() {
  const d = useDerived()
  const navigate = useNavigate()
  const { state, today, stats, readiness, calendar } = d
  const s = state.settings
  const todayPlan = calendar.find((c) => c.date === today)
  const session = activeSession(state)
  const diagnosticDone = state.quizzes.some((q) => q.kind === 'diagnostic' && q.submittedAt)
  const openDiag = openQuiz('diagnostic')
  const openMock = state.quizzes.find((q) => !q.submittedAt && (q.kind.startsWith('mock') || q.kind === 'readiness'))
  const doneToday = state.sessions.some((x) => x.date === today && x.completedAt)
  const mockDoneToday = state.quizzes.some((q) => q.date === today && q.submittedAt && (q.kind.startsWith('mock') || q.kind === 'readiness'))
  const topic = OBJECTIVE_BY_ID[d.nextTopic.objectiveId]
  const studyToday = isStudyDay(s, today)

  const goQuiz = (kind: Parameters<typeof createQuiz>[0]) => {
    const q = createQuiz(kind)
    if (q) navigate(`/quiz/${q.id}`)
  }
  const startStudy = () => {
    startSession()
    navigate('/session')
  }

  let action: Action
  if (openDiag) {
    action = { title: 'Finish your diagnostic', detail: `${Object.keys(openDiag.answers).length}/${openDiag.questionIds.length} answered — pick up where you left off.`, cta: 'Resume diagnostic', onClick: () => navigate(`/quiz/${openDiag.id}`) }
  } else if (!diagnosticDone && !session) {
    action = {
      title: 'Start with a 15-minute diagnostic',
      detail: '18 questions across all six sections to measure what you retained over your two-month break. Your plan adapts to the result.',
      cta: 'Take the diagnostic',
      onClick: () => navigate('/diagnostic'),
      secondary: { label: 'Skip and start a session', onClick: startStudy },
    }
  } else if (session) {
    action = {
      title: 'Resume your session',
      detail: `${OBJECTIVE_BY_ID[session.objectiveId].title} · ${session.stage === 'recall' ? 'Recall' : session.stage === 'learn' ? 'Learning' : 'Practice'} stage · ${formatMinutes(sessionElapsed(session))} so far`,
      cta: 'Resume session',
      onClick: () => navigate('/session'),
    }
  } else if (openMock) {
    action = { title: `Resume ${openMock.title.toLowerCase()}`, detail: 'Your timed attempt is still open.', cta: 'Resume', onClick: () => navigate(`/quiz/${openMock.id}`) }
  } else if (todayPlan?.plan?.kind === 'mock-half' && !mockDoneToday) {
    action = {
      title: 'Half mock exam tonight',
      detail: '30 questions in 53 minutes, weighted like the real exam, drawn from questions you haven’t seen.',
      cta: 'Start half mock',
      onClick: () => goQuiz('mock-half'),
      secondary: { label: 'Regular session instead', onClick: startStudy },
    }
  } else if (todayPlan?.plan?.kind === 'readiness' && !mockDoneToday) {
    action = {
      title: 'Final readiness assessment',
      detail: '30 fresh exam-weighted questions under time pressure. Then review your readiness checks honestly.',
      cta: 'Start assessment',
      onClick: () => goQuiz('readiness'),
      secondary: { label: 'Light review session', onClick: startStudy },
    }
  } else if (!doneToday) {
    action = {
      title: studyToday ? 'Tonight’s 60-minute session' : 'Optional catch-up session',
      detail: `${topic.title} — ${SECTION_BY_ID[topic.sectionId].name}`,
      cta: 'Start session',
      onClick: startStudy,
    }
  } else {
    action = {
      title: 'Done for today ✓',
      detail: `Next: ${topic.title}. Rest is part of the plan — a short mistake review is optional.`,
      cta: 'Review my mistakes (optional)',
      onClick: () => goQuiz('mistakes'),
    }
  }

  // Weekly consistency: Monday–Sunday of this week.
  const monday = addDays(today, -((weekday(today) + 6) % 7))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const planned = weekDays.filter((x) => isStudyDay(s, x) && x <= today && x >= PROFILE.startDate)
  const studied = weekDays.filter((x) => calendar.find((c) => c.date === x)?.status === 'done')
  const sessionsDone = state.sessions.filter((x) => x.completedAt).length
  const upcoming = stats.objectives
    .filter((o) => o.srs.nextReview && o.srs.nextReview <= addDays(today, 3))
    .sort((a, b) => (a.srs.nextReview! < b.srs.nextReview! ? -1 : 1))
    .slice(0, 5)
  const recentMistakes = d.mistakes.filter((m) => !m.resolved).slice(0, 3)
  const nextStudy = calendar.find((c) => c.date >= today && c.isStudyDay && c.status !== 'done')

  return (
    <div>
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatDate(today, { weekday: true })}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">BA Exam Coach</h1>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums text-brand-600 dark:text-brand-300">{Math.max(0, d.daysToTarget)}</div>
          <div className="text-xs text-slate-500">days to {formatDate(s.targetDate)}</div>
        </div>
      </header>

      <section aria-label="Next best action" className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Next best action</div>
        <h2 className="mt-1 text-2xl font-bold leading-tight">{action.title}</h2>
        <p className="mt-1.5 text-white/85">{action.detail}</p>
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 text-base font-bold text-brand-700 shadow-sm hover:bg-brand-50 active:bg-brand-100"
        >
          <PlayIcon /> {action.cta}
        </button>
        {action.secondary && (
          <button type="button" onClick={action.secondary.onClick} className="mt-2 w-full min-h-11 text-sm font-medium text-white/85 underline underline-offset-2">
            {action.secondary.label}
          </button>
        )}
      </section>

      {!doneToday && !session && diagnosticDone && (
        <>
          <SectionTitle>Today’s 60-minute plan</SectionTitle>
          <Card>
            <ol className="space-y-2.5">
              {[
                { m: s.stageMinutes.recall, t: 'Active recall', d: 'Due reviews and past mistakes — answer from memory' },
                { m: s.stageMinutes.learn, t: 'Guided learning', d: `${topic.title} with the official resource` },
                { m: s.stageMinutes.practice, t: 'Exam practice', d: 'Scenario questions with explanations' },
              ].map((x, i) => (
                <li key={x.t} className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">{String.fromCharCode(65 + i)}</span>
                  <div>
                    <div className="font-semibold">
                      {x.t} <span className="font-normal text-slate-500">· {x.m} min</span>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">{x.d}</div>
                  </div>
                </li>
              ))}
            </ol>
            {todayPlan?.plan && <p className="mt-3 text-xs text-slate-500">Calendar plan: {todayPlan.plan.title}. The coach adapts this to your results.</p>}
          </Card>
        </>
      )}

      <SectionTitle action={<Link to="/progress" className="text-sm font-medium text-brand-700 dark:text-brand-300">Details</Link>}>Readiness</SectionTitle>
      <Card>
        <div className="flex items-center gap-4">
          <Ring value={readiness.weightedStudyScore} label={pct(readiness.weightedStudyScore)} sub="study score" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{readiness.headline}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{readiness.recommendation}</p>
            <p className="mt-1 text-xs text-slate-500">
              Pass mark {EXAM_FACTS.passingPercent}% · coach target ≥ 80% on fresh mocks · previous attempt 62%
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Sessions done" value={sessionsDone} />
        <Stat label="This week" value={`${studied.length}/${Math.max(planned.length, studied.length)}`} hint="planned days studied" />
        <Stat label="Next session" value={nextStudy ? formatDate(nextStudy.date) : '—'} hint={nextStudy ? s.studyTime : undefined} />
      </div>

      <SectionTitle action={<Link to="/topics" className="text-sm font-medium text-brand-700 dark:text-brand-300">Topics</Link>}>Exam sections</SectionTitle>
      <Card>
        <ul className="space-y-3.5">
          {stats.sections.map((sec) => (
            <li key={sec.sectionId}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{sec.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-500">{Math.round(sec.weight * 100)}%</span>
                  <LevelBadge level={sec.level} />
                </span>
              </div>
              <ProgressBar value={sec.estimate} className="mt-1.5" barClass={SECTION_COLORS[sec.sectionId].bar} />
              <div className="mt-0.5 flex justify-between text-xs text-slate-500">
                <span>
                  Estimate {pct(sec.estimate)} {sec.attempts ? `· ${sec.attempts} answers` : '· from previous exam'}
                </span>
                <span>Baseline {pct(sec.baseline)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <SectionTitle>Upcoming reviews</SectionTitle>
          <Card>
            {upcoming.length ? (
              <ul className="space-y-2 text-sm">
                {upcoming.map((o) => (
                  <li key={o.objective.id} className="flex justify-between gap-2">
                    <span className="truncate">{o.objective.title}</span>
                    <Badge className={cx(o.srs.nextReview! <= today ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')}>
                      {o.srs.nextReview! <= today ? 'due' : formatDate(o.srs.nextReview!)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Reviews appear here once you’ve studied a topic.</p>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle action={<Link to="/mistakes" className="text-sm font-medium text-brand-700 dark:text-brand-300">All</Link>}>Recent mistakes</SectionTitle>
          <Card>
            {recentMistakes.length ? (
              <ul className="space-y-2 text-sm">
                {recentMistakes.map((m) => (
                  <li key={m.itemId}>
                    <div className="line-clamp-2">{m.questionText}</div>
                    <div className="text-xs text-slate-500">
                      {m.objectiveId} · remember: {m.principle}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No open mistakes.</p>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <LinkButton to="/practice" variant="secondary">
          <TargetIcon size={18} /> Practice
        </LinkButton>
        <LinkButton to="/mock" variant="secondary">
          <ExamIcon size={18} /> Mock exam
        </LinkButton>
      </div>
      {!diagnosticDone && (
        <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate('/settings#install')}>
          Install on your iPhone Home Screen
        </Button>
      )}
    </div>
  )
}
