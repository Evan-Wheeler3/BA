import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { MasteryLevel } from '../engine/mastery'
import { cx, LEVEL_STYLES } from './style'

export function Card({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return (
    <Tag className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5 dark:bg-slate-900 dark:ring-slate-800', className)}>
      {children}
    </Tag>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 dark:disabled:bg-brand-900',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700',
  ghost: 'text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-[15px]',
        size === 'lg' && 'min-h-14 px-6 text-base',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  to: string
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-[15px]',
        size === 'lg' && 'min-h-14 px-6 text-base',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}

export function ProgressBar({ value, className, barClass }: { value: number; className?: string; barClass?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div
      className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cx('h-full rounded-full transition-[width] duration-500', barClass ?? 'bg-brand-600')} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', className)}>{children}</span>
}

export function LevelBadge({ level }: { level: MasteryLevel }) {
  return <Badge className={LEVEL_STYLES[level]}>{level}</Badge>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
      {action}
    </div>
  )
}

export function Ring({ value, size = 88, stroke = 9, label, sub }: { value: number; size?: number; stroke?: number; label: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="fill-none stroke-brand-600 transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        <span className="text-lg font-bold">{label}</span>
        {sub && <span className="text-[11px] text-slate-500 dark:text-slate-400">{sub}</span>}
      </div>
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'success' | 'danger'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900',
    danger: 'bg-rose-50 text-rose-900 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900',
  }
  return <div className={cx('rounded-xl p-3 text-sm ring-1', tones[tone], className)}>{children}</div>
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx('font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300', className)}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 rounded-lg px-3 text-sm font-medium transition-colors',
            value === o.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
