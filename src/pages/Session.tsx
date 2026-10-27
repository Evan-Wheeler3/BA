import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OBJECTIVES, OBJECTIVE_BY_ID, SECTION_BY_ID } from '../domain/blueprint'
import { LESSON_BY_OBJECTIVE, QUESTION_BY_ID, RECALL_BY_ID } from '../domain/content'
import type { Attempt, StageId, StudySession } from '../domain/types'
import { formatDuration, formatMinutes } from '../engine/dates'
import { elapsed, isRunning } from '../engine/timer'
import { syncReminderPrefs } from '../cloud/push'
import {
  abandonSession,
  activeSession,
  completeSession,
  goToStage,
  patchSession,
  pauseSession,
  recordMcqAttempt,
  resumeSession,
  sessionElapsed,
  startSession,
} from '../state/actions'
import { useDerived } from '../state/derived'
import { getState } from '../state/store'
import { Badge, Button, Card, LinkButton, Notice, PageHeader, ProgressBar, SectionTitle, Stat } from '../ui/components'
import { cx, pct } from '../ui/style'
import { useNow } from '../ui/hooks'
import { PauseIcon, PlayIcon } from '../ui/icons'
import { LessonView } from '../ui/LessonView'
import { QuestionCard } from '../ui/QuestionCard'
import { RecallCard } from '../ui/RecallCard'

const STAGE_META: Record<StageId, { label: string; short: string }> = {
  recall: { label: 'Active recall', short: 'Recall' },
  learn: { label: 'Guided learning', short: 'Learn' },
  practice: { label: 'Exam practice', short: 'Practice' },
}
const ORDER: StageId[] = ['recall', 'learn', 'practice']

export default function SessionPage() {
  const d = useDerived()
  const { state } = d
  const session = activeSession(state)
  const lastCompletedToday = [...state.sessions]
    .filter((s) => s.completedAt && s.date === d.today)
    .sort((a, b) => b.completedAt! - a.completedAt!)[0]
  const [showSummaryId, setShowSummaryId] = useState<string | null>(null)

  // Resume timers when returning to an in-progress session.
  useEffect(() => {
    if (session && session.stage !== 'summary' && !ORDER.some((st) => isRunning(session.timers[st]))) resumeSession(session.id)
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (session) return <ActiveSession session={session} onFinished={(id) => setShowSummaryId(id)} />
  if (showSummaryId) {
    const s = state.sessions.find((x) => x.id === showSummaryId)
    if (s) return <SessionSummary session={s} />
  }
  if (lastCompletedToday) return <SessionSummary session={lastCompletedToday} />
  return <StartScreen />
}

function StartScreen() {
  const d = useDerived()
  const [override, setOverride] = useState<string>('')
  const topic = OBJECTIVE_BY_ID[override || d.nextTopic.objectiveId]
  const diagnosticDone = d.state.quizzes.some((q) => q.kind === 'diagnostic' && q.submittedAt)
  const minutes = d.state.settings.stageMinutes
  return (
    <div>
      <PageHeader title="Tonight’s session" subtitle={`${minutes.recall + minutes.learn + minutes.practice} minutes · recall → learn → practice`} />
      {!diagnosticDone && (
        <Notice tone="warn" className="mb-4">
          You haven’t taken the 15-minute diagnostic yet. It measures what you’ve retained after your break so tonight’s topic is chosen on evidence.{' '}
          <Link to="/diagnostic" className="font-semibold underline">
            Take the diagnostic first
          </Link>
        </Notice>
      )}
      <Card>
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Today’s focus</div>
        <h2 className="mt-1 text-xl font-bold">{topic.title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {SECTION_BY_ID[topic.sectionId].name} · Objective {topic.id}
        </p>
        {!override && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {d.nextTopic.reasons.map((r) => (
              <li key={r}>
                <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{r}</Badge>
              </li>
            ))}
          </ul>
        )}
        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {ORDER.map((st, i) => (
            <li key={st} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="text-xs text-slate-500">Stage {String.fromCharCode(65 + i)}</div>
              <div className="font-semibold">{STAGE_META[st].label}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">{minutes[st]} min</div>
            </li>
          ))}
        </ol>
        <Button size="lg" className="mt-4 w-full" onClick={() => startSession(override || undefined)}>
          <PlayIcon /> Start session
        </Button>
        <details className="mt-3">
          <summary className="min-h-9 cursor-pointer text-sm text-slate-600 dark:text-slate-400">Study a different topic instead</summary>
          <select
            className="mt-2 w-full rounded-xl bg-white p-3 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            aria-label="Choose topic"
          >
            <option value="">Recommended: {OBJECTIVE_BY_ID[d.nextTopic.objectiveId].title}</option>
            {OBJECTIVES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} — {o.title}
              </option>
            ))}
          </select>
        </details>
      </Card>
    </div>
  )
}

function StageTimer({ session, stage, now }: { session: StudySession; stage: StageId; now: number }) {
  const limit = getState().settings.stageMinutes[stage] * 60_000
  const used = elapsed(session.timers[stage], now)
  const over = used > limit
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{STAGE_META[stage].label}</span>
        <span className={cx('font-mono tabular-nums', over && 'text-amber-600 dark:text-amber-400')}>
          {over ? `+${formatDuration(used - limit)} over` : `${formatDuration(limit - used)} left`}
        </span>
      </div>
      <ProgressBar value={used / limit} className="mt-1.5" barClass={over ? 'bg-amber-500' : undefined} />
      {over && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">Time’s up for this stage — finish the current item, then move on.</p>}
    </div>
  )
}

function ActiveSession({ session, onFinished }: { session: StudySession; onFinished: (id: string) => void }) {
  const now = useNow(1000)
  const { state } = useDerived()
  const running = ORDER.some((st) => isRunning(session.timers[st]))
  const stage = session.stage as StageId
  const obj = OBJECTIVE_BY_ID[session.objectiveId]
  const sessionAttempts = useMemo(() => state.attempts.filter((a) => a.sessionId === session.id), [state.attempts, session.id])
  const existingFor = (itemId: string): Attempt | undefined => [...sessionAttempts].reverse().find((a) => a.itemId === itemId)

  function finish() {
    completeSession(session.id)
    void syncReminderPrefs(getState())
    onFinished(session.id)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Study session · {obj.id}</div>
          <h1 className="truncate text-xl font-bold">{obj.title}</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => (running ? pauseSession(session.id) : resumeSession(session.id))} aria-label={running ? 'Pause session' : 'Resume session'}>
          {running ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          {running ? 'Pause' : 'Resume'}
        </Button>
      </div>

      <nav aria-label="Session stages" className="mb-3 grid grid-cols-3 gap-1.5">
        {ORDER.map((st, i) => {
          const active = st === stage
          const done = ORDER.indexOf(stage) > i
          return (
            <button
              key={st}
              type="button"
              onClick={() => goToStage(session.id, st)}
              className={cx(
                'min-h-12 rounded-xl px-2 text-left text-xs ring-1',
                active ? 'bg-brand-600 text-white ring-brand-600' : done ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900' : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700',
              )}
              aria-current={active ? 'step' : undefined}
            >
              <div className="font-semibold">
                {String.fromCharCode(65 + i)} · {STAGE_META[st].short}
              </div>
              <div className={active ? 'text-white/80' : 'text-slate-500'}>{formatDuration(elapsed(session.timers[st], now))}</div>
            </button>
          )
        })}
      </nav>

      {!running && (
        <Notice tone="info" className="mb-3">
          Paused — your place is saved. Resume whenever you’re ready; time while paused isn’t counted.
        </Notice>
      )}

      <Card className="mb-4">
        <StageTimer session={session} stage={stage} now={now} />
      </Card>

      {stage === 'recall' && <RecallStage session={session} existingFor={existingFor} />}
      {stage === 'learn' && <LearnStage session={session} existingFor={existingFor} />}
      {stage === 'practice' && <PracticeStage session={session} existingFor={existingFor} onFinish={finish} />}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <span className="text-sm text-slate-500">Total {formatMinutes(sessionElapsed(session, now))}</span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('Discard this session? Answers you already gave stay in your history.')) abandonSession(session.id)
            }}
          >
            Discard
          </Button>
          <Button variant="secondary" size="sm" onClick={finish}>
            Finish early
          </Button>
        </div>
      </div>
    </div>
  )
}

function RecallStage({ session, existingFor }: { session: StudySession; existingFor: (id: string) => Attempt | undefined }) {
  const { state } = useDerived()
  const queue = session.recallQueue
  const idx = session.recallIndex
  const promptId = queue[idx]
  if (!promptId) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Recall complete</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {queue.length ? `You answered ${queue.length} recall prompts. Results feed tomorrow’s review schedule.` : 'Nothing is due for recall yet.'}
        </p>
        <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={() => goToStage(session.id, 'learn')}>
          Continue to guided learning
        </Button>
      </Card>
    )
  }
  return (
    <Card>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Answer from memory before opening any resource. The model answer appears only after you submit.</p>
      <RecallCard
        key={promptId}
        prompt={RECALL_BY_ID[promptId]}
        sessionId={session.id}
        askConfidence={idx % 2 === 0}
        aiEnabled={state.settings.aiGrading}
        existing={existingFor(promptId)}
        index={idx}
        total={queue.length}
        onDone={() => patchSession(session.id, { recallIndex: idx + 1 })}
      />
      <button type="button" className="mt-4 text-sm text-slate-500 underline" onClick={() => goToStage(session.id, 'learn')}>
        Skip to guided learning
      </button>
    </Card>
  )
}

function LearnStage({ session, existingFor }: { session: StudySession; existingFor: (id: string) => Attempt | undefined }) {
  const lesson = LESSON_BY_OBJECTIVE[session.objectiveId]
  const [checking, setChecking] = useState(session.checkIndex > 0)
  const checkId = session.checkQueue[session.checkIndex]
  return (
    <div className="space-y-4">
      {!checking && (
        <>
          <LessonView
            lesson={lesson}
            checkpointsDone={session.checkpointsDone}
            onOpenResource={() => patchSession(session.id, { resourceOpened: true })}
            onToggleCheckpoint={(i) =>
              patchSession(session.id, {
                checkpointsDone: session.checkpointsDone.includes(i) ? session.checkpointsDone.filter((x) => x !== i) : [...session.checkpointsDone, i],
              })
            }
          />
          {!session.resourceOpened && (
            <Notice tone="info">Open the official resource above and study the named section. The resource opens in a new tab; this session stays here.</Notice>
          )}
          <Button size="lg" className="w-full" onClick={() => setChecking(true)}>
            I’ve studied it — start the knowledge check
          </Button>
        </>
      )}
      {checking && checkId && (
        <Card>
          <h2 className="mb-3 font-semibold">Knowledge check</h2>
          <QuestionCard
            key={checkId}
            question={QUESTION_BY_ID[checkId]}
            mode="answer"
            index={session.checkIndex}
            total={session.checkQueue.length}
            existing={existingFor(checkId)?.selected}
            onSubmit={(sel, conf) => recordMcqAttempt({ questionId: checkId, selected: sel, confidence: conf, source: 'session-check', sessionId: session.id })}
            footer={
              existingFor(checkId) ? null : (
                <button type="button" className="text-sm text-slate-500 underline" onClick={() => setChecking(false)}>
                  Back to the lesson
                </button>
              )
            }
          />
          <CheckNext session={session} answered={!!existingFor(checkId)} />
        </Card>
      )}
      {checking && !checkId && (
        <Card>
          <h2 className="text-lg font-semibold">Lesson complete</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Now apply it to exam-style scenarios.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="lg" onClick={() => goToStage(session.id, 'practice')}>
              Start practice
            </Button>
            <Button variant="secondary" onClick={() => setChecking(false)}>
              Review the lesson
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function CheckNext({ session, answered }: { session: StudySession; answered: boolean }) {
  if (!answered) return null
  return (
    <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={() => patchSession(session.id, { checkIndex: session.checkIndex + 1 })}>
      Next
    </Button>
  )
}

function PracticeStage({
  session,
  existingFor,
  onFinish,
}: {
  session: StudySession
  existingFor: (id: string) => Attempt | undefined
  onFinish: () => void
}) {
  const { state } = useDerived()
  const qid = session.practiceQueue[session.practiceIndex]
  const seenBefore = useMemo(() => {
    if (!qid) return false
    return state.attempts.some((a) => a.itemId === qid && a.sessionId !== session.id)
  }, [qid, state.attempts, session.id])
  if (!qid) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Practice complete</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Finish to see your session summary and tomorrow’s focus.</p>
        <Button size="lg" className="mt-4 w-full sm:w-auto" variant="success" onClick={onFinish}>
          Finish session
        </Button>
      </Card>
    )
  }
  const existing = existingFor(qid)
  return (
    <Card>
      <QuestionCard
        key={qid}
        question={QUESTION_BY_ID[qid]}
        mode="answer"
        index={session.practiceIndex}
        total={session.practiceQueue.length}
        seenBefore={seenBefore}
        askConfidence={session.practiceIndex % 3 === 1}
        existing={existing?.selected}
        onSubmit={(sel, conf) => recordMcqAttempt({ questionId: qid, selected: sel, confidence: conf, source: 'session-practice', sessionId: session.id })}
      />
      {existing && (
        <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={() => patchSession(session.id, { practiceIndex: session.practiceIndex + 1 })}>
          {session.practiceIndex + 1 < session.practiceQueue.length ? 'Next question' : 'See results'}
        </Button>
      )}
    </Card>
  )
}

export function SessionSummary({ session }: { session: StudySession }) {
  const d = useDerived()
  const atts = d.state.attempts.filter((a) => a.sessionId === session.id)
  const recall = atts.filter((a) => a.source === 'session-recall')
  const checks = atts.filter((a) => a.source === 'session-check')
  const practice = atts.filter((a) => a.source === 'session-practice')
  const avg = (xs: Attempt[]) => (xs.length ? xs.reduce((s, a) => s + a.score, 0) / xs.length : null)
  const byObj = new Map<string, number[]>()
  for (const a of atts) byObj.set(a.objectiveId, [...(byObj.get(a.objectiveId) ?? []), a.score])
  const mastered = [...byObj].filter(([, s]) => s.length >= 2 && s.every((x) => x >= 0.75)).map(([id]) => id)
  const review = [...byObj].filter(([, s]) => s.some((x) => x < 0.75)).map(([id]) => id)
  const total = ORDER.reduce((s, st) => s + elapsed(session.timers[st]), 0)
  const next = OBJECTIVE_BY_ID[d.nextTopic.objectiveId]
  return (
    <div>
      <PageHeader title={session.completedAt ? 'Session complete' : 'Session summary'} subtitle={`${OBJECTIVE_BY_ID[session.objectiveId].title} · ${session.date}`} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Recall score" value={recall.length ? `${(recall.reduce((s, a) => s + (a.rubric ?? 0), 0) / recall.length).toFixed(1)}/4` : '—'} hint={`${recall.length} prompts`} />
        <Stat label="Checkpoint score" value={pct(avg(checks))} hint={`${checks.length} checks · ${session.checkpointsDone.length} takeaways ticked`} />
        <Stat label="Practice accuracy" value={pct(avg(practice))} hint={`${practice.filter((a) => a.score === 1).length}/${practice.length} correct`} />
        <Stat label="Time spent" value={formatMinutes(total)} />
      </div>
      <SectionTitle>Concepts mastered this session</SectionTitle>
      <Card>
        {mastered.length ? (
          <ul className="space-y-1 text-sm">
            {mastered.map((id) => (
              <li key={id}>✓ {id} — {OBJECTIVE_BY_ID[id].title}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">None yet (needs ≥ 2 correct answers on a concept in one session).</p>
        )}
      </Card>
      <SectionTitle>Concepts to review</SectionTitle>
      <Card>
        {review.length ? (
          <ul className="space-y-1 text-sm">
            {review.map((id) => (
              <li key={id}>• {id} — {OBJECTIVE_BY_ID[id].title} (added to your mistake notebook and tomorrow’s recall)</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nothing to review — nice work.</p>
        )}
      </Card>
      <SectionTitle>Next session’s focus</SectionTitle>
      <Card>
        <div className="font-semibold">{next.title}</div>
        <p className="text-sm text-slate-600 dark:text-slate-400">{d.nextTopic.reasons.join(' · ')}</p>
      </Card>
      <div className="mt-6 flex flex-wrap gap-2">
        <LinkButton to="/">Back to dashboard</LinkButton>
        <LinkButton to="/mistakes" variant="secondary">
          Review mistakes
        </LinkButton>
        <Button variant="ghost" onClick={() => startSession()}>
          Start another session
        </Button>
      </div>
    </div>
  )
}
