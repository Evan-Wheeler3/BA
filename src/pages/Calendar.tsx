import { Link } from 'react-router-dom'
import { PHASES } from '../engine/planner'
import { formatDate } from '../engine/dates'
import { buildStudyCalendarIcs, downloadFile } from '../engine/ics'
import { useDerived } from '../state/derived'
import { Badge, Button, Card, PageHeader, SectionTitle } from '../ui/components'
import { cx } from '../ui/style'
import { CalendarIcon } from '../ui/icons'

const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  partial: { label: 'Started', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  missed: { label: 'Missed', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
  today: { label: 'Today', cls: 'bg-brand-600 text-white' },
  upcoming: { label: 'Planned', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  rest: { label: 'Rest', cls: 'bg-transparent text-slate-400' },
}

export default function CalendarPage() {
  const d = useDerived()
  const s = d.state.settings
  const done = d.calendar.filter((c) => c.status === 'done').length
  const missed = d.calendar.filter((c) => c.status === 'missed').length
  const next = d.calendar.find((c) => c.date >= d.today && c.isStudyDay && c.status !== 'done')

  function exportIcs() {
    const start = next?.date ?? d.today
    downloadFile('ba-exam-study-sessions.ics', buildStudyCalendarIcs(s, start, window.location.origin), 'text/calendar')
  }

  return (
    <div>
      <PageHeader
        title="Study calendar"
        subtitle={`${d.daysToTarget} days to ${formatDate(s.targetDate)} · ${d.remainingStudyDays} study days left · ${done} done · ${missed} missed`}
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Next session</div>
            <div className="text-lg font-semibold">{next ? `${formatDate(next.date, { weekday: true })} at ${s.studyTime}` : 'None scheduled'}</div>
          </div>
          <Button variant="secondary" onClick={exportIcs}>
            <CalendarIcon size={18} /> Add to my calendar (.ics)
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The plan below is the starting allocation. The coach adapts each night’s topic to your results — topics shown here may change. Weekends are optional catch-up days. Change days and times in{' '}
          <Link to="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      </Card>

      {PHASES.map((phase) => {
        const days = d.calendar.filter((c) => c.date >= phase.start && c.date <= phase.end)
        if (!days.length) return null
        return (
          <section key={phase.id} className="mb-2">
            <SectionTitle>{phase.name}</SectionTitle>
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              {days.map((c) => {
                const st = STATUS[c.status]
                return (
                  <div
                    key={c.date}
                    className={cx('flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 dark:border-slate-800', c.status === 'today' && 'bg-brand-50 dark:bg-brand-950/30', !c.isStudyDay && !c.plan && 'opacity-60')}
                  >
                    <div className="w-20 shrink-0 text-sm">
                      <div className="font-semibold">{formatDate(c.date, { weekday: true }).split(',')[0]}</div>
                      <div className="text-xs text-slate-500">{formatDate(c.date)}</div>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">{c.plan ? c.plan.title : <span className="text-slate-400">Rest / optional catch-up</span>}</div>
                    <Badge className={st.cls}>{st.label}</Badge>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      {d.calendar.some((c) => c.date > PHASES[PHASES.length - 1].end) && (
        <section>
          <SectionTitle>After the original plan</SectionTitle>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            {d.calendar
              .filter((c) => c.date > PHASES[PHASES.length - 1].end)
              .map((c) => (
                <div key={c.date} className="flex min-h-12 items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-0 dark:border-slate-800">
                  <div className="w-20 text-sm font-semibold">{formatDate(c.date)}</div>
                  <div className="flex-1 text-sm">{c.plan?.title ?? 'Rest'}</div>
                  <Badge className={STATUS[c.status].cls}>{STATUS[c.status].label}</Badge>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
