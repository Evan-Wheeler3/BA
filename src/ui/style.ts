import type { MasteryLevel } from '../engine/mastery'
import type { Confidence, SectionId } from '../domain/types'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export const SECTION_COLORS: Record<SectionId, { bar: string; soft: string; text: string }> = {
  CD: { bar: 'bg-sky-500', soft: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-700 dark:text-sky-300' },
  CS: { bar: 'bg-violet-500', soft: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300' },
  BPM: { bar: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300' },
  RQ: { bar: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300' },
  US: { bar: 'bg-teal-500', soft: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300' },
  UA: { bar: 'bg-rose-500', soft: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300' },
}

export const LEVEL_STYLES: Record<MasteryLevel, string> = {
  New: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Learning: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  Developing: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  'Nearly ready': 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  Strong: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'Demonstrated mastery': 'bg-emerald-600 text-white',
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

export const CONFIDENCE_OPTIONS: { value: Confidence; label: string }[] = [
  { value: 'low', label: 'Guessing' },
  { value: 'med', label: 'Fairly sure' },
  { value: 'high', label: 'Certain' },
]
