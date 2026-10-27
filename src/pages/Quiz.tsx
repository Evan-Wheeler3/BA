import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EXAM_FACTS, OBJECTIVE_BY_ID, SECTIONS } from '../domain/blueprint'
import { QUESTION_BY_ID } from '../domain/content'
import type { Quiz } from '../domain/types'
import { formatDuration, formatMinutes } from '../engine/dates'
import { isCorrect } from '../engine/grading'
import { mockResults, scoreQuiz } from '../engine/readiness'
import { elapsed, isRunning } from '../engine/timer'
import {
  discardQuiz,
  pauseQuiz,
  resumeQuiz,
  setQuizAnswer,
  setQuizIndex,
  submitQuiz,
  submitQuizQuestion,
  toggleFlag,
} from '../state/actions'
import { useAppState } from '../state/store'
import { Button, Card, LinkButton, Notice, PageHeader, ProgressBar, SectionTitle, Stat } from '../ui/components'
import { cx, pct } from '../ui/style'
import { useNow } from '../ui/hooks'
import { ChevronLeft, ChevronRight, ClockIcon, FlagIcon, PauseIcon, PlayIcon } from '../ui/icons'
import { QuestionCard } from '../ui/QuestionCard'

export default function QuizPage() {
  const { id } = useParams()
  const state = useAppState()
  const quiz = state.quizzes.find((q) => q.id === id)
  if (!quiz) {
    return (
      <div>
        <PageHeader title="Quiz not found" />
        <LinkButton to="/practice">Back to practice</LinkButton>
      </div>
    )
  }
  if (quiz.submittedAt) return <QuizResults quiz={quiz} />
  return <QuizRunner quiz={quiz} />
}

function QuizRunner({ quiz }: { quiz: Quiz }) {
  const now = useNow(1000)
  const navigate = useNavigate()
  const state = useAppState()
  const [showGrid, setShowGrid] = useState(false)
  const qid = quiz.questionIds[quiz.index]
  const question = QUESTION_BY_ID[qid]
  const used = elapsed(quiz.timer, now)
  const remaining = quiz.timeLimitMs !== undefined ? quiz.timeLimitMs - used : undefined
  const running = isRunning(quiz.timer)
  const answeredCount = quiz.questionIds.filter((id) => quiz.answers[id]?.length).length
  const exam = quiz.feedback === 'end'

  // Auto-submit when time runs out (works even if the phone slept: time is timestamp-based).
  useEffect(() => {
    if (remaining !== undefined && remaining <= 0) submitQuiz(quiz.id)
  }, [remaining, quiz.id])

  // Immediate-feedback quizzes: has this question already been answered in this quiz?
  const recorded = useMemo(
    () => state.attempts.find((a) => a.quizId === quiz.id && a.itemId === qid),
    [state.attempts, quiz.id, qid],
  )

  const isLast = quiz.index === quiz.questionIds.length - 1

  function submitAll() {
    const unanswered = quiz.questionIds.length - answeredCount
    if (exam && unanswered > 0 && !confirm(`${unanswered} question(s) unanswered — they will be marked incorrect. Submit anyway?`)) return
    submitQuiz(quiz.id)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">{exam ? 'Exam mode — answers revealed after submitting' : 'Practice mode — feedback after each answer'}</div>
          <h1 className="truncate text-xl font-bold">{quiz.title}</h1>
        </div>
        {remaining !== undefined && (
          <div className="flex items-center gap-2">
            <span className={cx('flex items-center gap-1 font-mono text-sm tabular-nums', remaining < 5 * 60_000 && 'text-rose-600')}>
              <ClockIcon size={16} /> {formatDuration(Math.max(0, remaining))}
            </span>
            <Button
              variant="secondary"
              size="sm"
              aria-label={running ? 'Pause timer' : 'Resume timer'}
              onClick={() => (running ? pauseQuiz(quiz.id) : resumeQuiz(quiz.id))}
            >
              {running ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            </Button>
          </div>
        )}
      </div>
      <ProgressBar value={answeredCount / quiz.questionIds.length} className="mb-3" />
      {quiz.wasPaused && exam && <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">The timer was paused — this attempt is marked as not exam-realistic.</p>}

      {!running && remaining !== undefined ? (
        <Card>
          <p className="font-medium">Paused. Questions are hidden while the timer is paused.</p>
          <Button className="mt-3" onClick={() => resumeQuiz(quiz.id)}>
            Resume
          </Button>
        </Card>
      ) : (
        <Card>
          {exam ? (
            <QuestionCard
              key={qid}
              question={question}
              mode="exam"
              index={quiz.index}
              total={quiz.questionIds.length}
              seenBefore={quiz.seenBefore.includes(qid) && quiz.kind !== 'diagnostic'}
              selected={quiz.answers[qid]}
              onSelect={(sel) => setQuizAnswer(quiz.id, qid, sel)}
              confidence={quiz.confidence[qid]}
              onConfidence={(c) => setQuizAnswer(quiz.id, qid, quiz.answers[qid] ?? [], c)}
            />
          ) : (
            <QuestionCard
              key={qid}
              question={question}
              mode="answer"
              index={quiz.index}
              total={quiz.questionIds.length}
              seenBefore={quiz.seenBefore.includes(qid)}
              askConfidence={quiz.index % 3 === 0}
              existing={recorded?.selected}
              onSubmit={(sel, conf) => submitQuizQuestion(quiz.id, qid, sel, conf)}
            />
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={quiz.index === 0} onClick={() => setQuizIndex(quiz.id, quiz.index - 1)} aria-label="Previous question">
              <ChevronLeft size={18} />
            </Button>
            {exam && (
              <Button
                variant={quiz.flagged.includes(qid) ? 'primary' : 'secondary'}
                onClick={() => toggleFlag(quiz.id, qid)}
                aria-pressed={quiz.flagged.includes(qid)}
              >
                <FlagIcon size={16} /> {quiz.flagged.includes(qid) ? 'Flagged' : 'Flag'}
              </Button>
            )}
            {!isLast && (exam || recorded) && (
              <Button onClick={() => setQuizIndex(quiz.id, quiz.index + 1)}>
                Next <ChevronRight size={18} />
              </Button>
            )}
            {isLast && (exam || recorded) && (
              <Button variant="success" onClick={submitAll}>
                {exam ? 'Submit exam' : 'Finish'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {exam && (
        <div className="mt-4">
          <button type="button" className="text-sm font-medium text-brand-700 underline dark:text-brand-300" onClick={() => setShowGrid((v) => !v)}>
            {showGrid ? 'Hide' : 'Show'} question navigator ({answeredCount}/{quiz.questionIds.length} answered, {quiz.flagged.length} flagged)
          </button>
          {showGrid && (
            <div className="mt-3 grid grid-cols-8 gap-1.5 sm:grid-cols-12">
              {quiz.questionIds.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setQuizIndex(quiz.id, i)}
                  className={cx(
                    'relative h-10 rounded-lg text-sm font-medium ring-1',
                    i === quiz.index && 'ring-2 ring-brand-500',
                    quiz.answers[id]?.length ? 'bg-brand-100 ring-brand-200 dark:bg-brand-900 dark:ring-brand-800' : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700',
                  )}
                  aria-label={`Question ${i + 1}${quiz.flagged.includes(id) ? ', flagged' : ''}`}
                >
                  {i + 1}
                  {quiz.flagged.includes(id) && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-amber-500" />}
                </button>
              ))}
            </div>
          )}
          {!isLast && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="success" onClick={submitAll}>
                Submit exam now
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="mt-8 border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(exam ? 'Discard this attempt? Nothing will be recorded.' : 'Leave this quiz? Answers already submitted are kept.')) {
              if (exam) discardQuiz(quiz.id)
              navigate(quiz.kind === 'diagnostic' ? '/' : quiz.kind.startsWith('mock') ? '/mock' : '/practice')
            }
          }}
        >
          {exam ? 'Discard attempt' : 'Leave quiz'}
        </Button>
      </div>
    </div>
  )
}

function QuizResults({ quiz }: { quiz: Quiz }) {
  const [filter, setFilter] = useState<'all' | 'wrong' | 'flagged'>('wrong')
  const { correct, total } = scoreQuiz(quiz)
  const mock = quiz.kind.startsWith('mock') || quiz.kind === 'readiness'
  const result = mock ? mockResults([quiz])[0] : undefined
  const bySection = SECTIONS.map((s) => {
    const ids = quiz.questionIds.filter((id) => OBJECTIVE_BY_ID[QUESTION_BY_ID[id].objectiveId].sectionId === s.id)
    const c = ids.filter((id) => quiz.answers[id] && isCorrect(QUESTION_BY_ID[id], quiz.answers[id])).length
    return { s, total: ids.length, correct: c }
  }).filter((x) => x.total > 0)
  const shown = quiz.questionIds.filter((id) => {
    const right = quiz.answers[id] && isCorrect(QUESTION_BY_ID[id], quiz.answers[id])
    if (filter === 'wrong') return !right
    if (filter === 'flagged') return quiz.flagged.includes(id)
    return true
  })
  const timeUsed = elapsed(quiz.timer, quiz.submittedAt)
  return (
    <div>
      <PageHeader title={`${quiz.title} — results`} subtitle={quiz.date} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Raw score" value={`${correct}/${total}`} hint={pct(total ? correct / total : 0)} />
        <Stat label="Time used" value={formatMinutes(timeUsed)} hint={quiz.timeLimitMs ? `of ${formatMinutes(quiz.timeLimitMs)}` : undefined} />
        {result && <Stat label="Fresh questions" value={pct(result.freshness)} hint="never seen before this attempt" />}
        {result && <Stat label="Score on fresh questions" value={result.freshTotal ? pct(result.freshCorrect / result.freshTotal) : '—'} />}
      </div>
      {mock && (
        <Notice tone="info" className="mt-3">
          The official passing score is {EXAM_FACTS.passingPercent}%. Practice percentages are not a prediction of your Salesforce score, and the real exam may include up to {EXAM_FACTS.unscoredQuestions} unscored questions. The coach recommends booking only after ≥ 80% on fresh, full-length practice.
          {quiz.wasPaused && ' This attempt was paused, so it is not exam-realistic.'}
        </Notice>
      )}
      {quiz.kind === 'diagnostic' && (
        <Notice tone="info" className="mt-3">
          Diagnostic results update your estimates, but 18 questions is a small sample — it guides early priorities, not a final verdict. Your study plan has been updated.
        </Notice>
      )}
      <SectionTitle>By section</SectionTitle>
      <Card>
        <ul className="space-y-3">
          {bySection.map(({ s, total: t, correct: c }) => (
            <li key={s.id}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{s.name}</span>
                <span>
                  {c}/{t} · {pct(c / t)}
                </span>
              </div>
              <ProgressBar value={c / t} className="mt-1" barClass={c / t >= 0.8 ? 'bg-emerald-500' : c / t >= 0.6 ? 'bg-amber-500' : 'bg-rose-500'} />
            </li>
          ))}
        </ul>
      </Card>
      <SectionTitle
        action={
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-lg bg-white px-2 py-1 text-sm ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700" aria-label="Filter review">
            <option value="wrong">Incorrect only</option>
            <option value="flagged">Flagged</option>
            <option value="all">All questions</option>
          </select>
        }
      >
        Review
      </SectionTitle>
      <div className="space-y-4">
        {shown.length === 0 && <p className="text-sm text-slate-500">Nothing to show.</p>}
        {shown.map((id) => (
          <Card key={id}>
            <QuestionCard question={QUESTION_BY_ID[id]} mode="review" selected={quiz.answers[id] ?? []} index={quiz.questionIds.indexOf(id)} total={quiz.questionIds.length} />
          </Card>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <LinkButton to="/">Dashboard</LinkButton>
        <LinkButton to="/mistakes" variant="secondary">
          Mistake notebook
        </LinkButton>
        <Link to={mock ? '/mock' : '/practice'} className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-brand-700 dark:text-brand-300">
          {mock ? 'Mock exams' : 'More practice'}
        </Link>
      </div>
    </div>
  )
}
