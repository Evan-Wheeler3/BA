import { OBJECTIVE_BY_ID, SECTION_BY_ID } from '../domain/blueprint'
import { RESOURCE_BY_ID } from '../domain/content'
import type { Lesson, Resource, ResourceRef } from '../domain/types'
import { Badge, Card } from './components'
import { cx, SECTION_COLORS } from './style'
import { CheckIcon, LinkIcon } from './icons'

const STATUS_LABEL: Record<Resource['status'], { label: string; cls: string; help: string }> = {
  reviewed: { label: 'Verified', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', help: 'Opened and reviewed.' },
  indexed: {
    label: 'Link found, not opened',
    cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    help: 'Confirmed to exist in a search index with a matching title, but the page itself was not opened by the coach.',
  },
  unverified: {
    label: 'Unverified link',
    cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    help: 'Supplied or cited elsewhere; not independently confirmed. If it fails, use the alternative or the module page.',
  },
}

export function ResourceCard({
  resourceRef,
  resource,
  whyItMatters,
  onOpen,
  primary,
}: {
  resource: Resource
  resourceRef?: ResourceRef
  whyItMatters?: string
  onOpen?: () => void
  primary?: boolean
}) {
  const status = STATUS_LABEL[resource.status]
  return (
    <div className={cx('rounded-2xl p-4 ring-1', primary ? 'bg-brand-50/60 ring-brand-200 dark:bg-brand-950/30 dark:ring-brand-900' : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={resource.official ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'}>
          {resource.official ? 'Official Salesforce' : 'Third-party'}
        </Badge>
        <Badge className={status.cls}>{status.label}</Badge>
        <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{resource.access}</Badge>
      </div>
      <h3 className="mt-2 font-semibold leading-snug">{resource.title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">{resource.publisher}</p>
      {resourceRef && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Focus on: </span>
          {resourceRef.focus}
        </p>
      )}
      {whyItMatters && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">Why now: </span>
          {whyItMatters}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        ~{resourceRef?.minutes ?? resource.minutes} min · Objectives:{' '}
        {(resource.objectiveIds.length ? resource.objectiveIds : resource.sectionIds).join(', ')} · Last checked {resource.lastChecked}
      </p>
      <p className="mt-1 text-xs text-slate-500">{status.help}</p>
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-semibold text-white hover:bg-brand-700"
      >
        <LinkIcon size={18} /> Open resource
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <p className="mt-1.5 break-all text-[11px] text-slate-400">{resource.url}</p>
    </div>
  )
}

export function LessonView({
  lesson,
  checkpointsDone,
  onToggleCheckpoint,
  onOpenResource,
}: {
  lesson: Lesson
  checkpointsDone?: number[]
  onToggleCheckpoint?: (i: number) => void
  onOpenResource?: () => void
}) {
  const obj = OBJECTIVE_BY_ID[lesson.objectiveId]
  const section = SECTION_BY_ID[obj.sectionId]
  const color = SECTION_COLORS[section.id]
  return (
    <div className="space-y-4">
      <div className={cx('rounded-2xl p-4', color.soft)}>
        <div className={cx('text-xs font-semibold uppercase tracking-wide', color.text)}>
          {section.name} · {Math.round(section.weight * 100)}% · Objective {obj.id}
        </div>
        <h2 className="mt-1 text-xl font-bold">{obj.title}</h2>
        <p className="mt-2 text-sm">
          <span className="font-semibold">Learning objective: </span>
          {lesson.learningObjective}
        </p>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-semibold">Coach summary</h3>
          <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Original summary — not official Salesforce content</Badge>
        </div>
        <div className="prose-coach text-[15px] leading-relaxed">
          {lesson.explanation.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold">Salesforce BA example</h3>
        <p className="text-[15px] leading-relaxed">{lesson.salesforceExample}</p>
      </Card>

      <div>
        <h3 className="mb-2 font-semibold">Study this official resource</h3>
        <ResourceCard resource={RESOURCE_BY_ID[lesson.primary.resourceId]} resourceRef={lesson.primary} whyItMatters={lesson.whyItMatters} onOpen={onOpenResource} primary />
        {lesson.alternatives.length > 0 && (
          <details className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <summary className="min-h-9 cursor-pointer font-medium">Alternative resources ({lesson.alternatives.length})</summary>
            <div className="mt-3 space-y-3">
              {lesson.alternatives.map((alt) => (
                <ResourceCard key={alt.resourceId} resource={RESOURCE_BY_ID[alt.resourceId]} resourceRef={alt} onOpen={onOpenResource} />
              ))}
            </div>
          </details>
        )}
      </div>

      <Card>
        <h3 className="mb-2 font-semibold">Learning checkpoints</h3>
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">Tick each one only when you could explain it without looking.</p>
        <ul className="space-y-2">
          {lesson.takeaways.map((t, i) => {
            const done = checkpointsDone?.includes(i)
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!onToggleCheckpoint}
                  onClick={() => onToggleCheckpoint?.(i)}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-xl p-3 text-left ring-1',
                    done ? 'bg-emerald-50 ring-emerald-300 dark:bg-emerald-950/40 dark:ring-emerald-800' : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700',
                  )}
                  aria-pressed={done}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1',
                      done ? 'bg-emerald-600 text-white ring-emerald-600' : 'ring-slate-300 dark:ring-slate-600',
                    )}
                  >
                    {done && <CheckIcon size={14} />}
                  </span>
                  <span className="text-[15px]">{t}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
