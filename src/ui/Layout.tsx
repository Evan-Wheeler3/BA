import { useEffect, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getStorageError } from '../state/store'
import { useOnline } from './hooks'
import { cx } from './style'
import {
  BookIcon,
  CalendarIcon,
  ChartIcon,
  ExamIcon,
  HomeIcon,
  LinkIcon,
  MenuIcon,
  NotebookIcon,
  PlayIcon,
  SettingsIcon,
  TargetIcon,
} from './icons'

const NAV = [
  { to: '/', label: 'Dashboard', icon: HomeIcon, end: true },
  { to: '/session', label: 'Study session', icon: PlayIcon },
  { to: '/practice', label: 'Practice', icon: TargetIcon },
  { to: '/mock', label: 'Mock exam', icon: ExamIcon },
  { to: '/mistakes', label: 'Mistake notebook', icon: NotebookIcon },
  { to: '/topics', label: 'Topics', icon: BookIcon },
  { to: '/resources', label: 'Resources', icon: LinkIcon },
  { to: '/progress', label: 'Progress', icon: ChartIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const TABS = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/session', label: 'Study', icon: PlayIcon },
  { to: '/practice', label: 'Practice', icon: TargetIcon },
  { to: '/mistakes', label: 'Mistakes', icon: NotebookIcon },
  { to: '/more', label: 'More', icon: MenuIcon },
]

export function Layout() {
  const online = useOnline()
  const location = useLocation()
  const storageError = getStorageError()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-dvh md:flex">
      <aside className="safe-top sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icons/icon-192.png" alt="" className="size-8 rounded-lg" />
          <div>
            <div className="text-sm font-bold leading-tight">BA Exam Coach</div>
            <div className="text-xs text-slate-500">Salesforce Business Analyst</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="safe-top">
          {!online && (
            <div className="bg-slate-800 px-4 py-1.5 text-center text-xs font-medium text-white">
              Offline — lessons, questions and progress still work. Changes sync when you reconnect.
            </div>
          )}
          {storageError && <div className="bg-rose-600 px-4 py-1.5 text-center text-xs font-medium text-white">{storageError}</div>}
        </div>
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95"
        aria-label="Tabs"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function MorePage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">More</h1>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        {NAV.filter((n) => !['/', '/session', '/practice', '/mistakes'].includes(n.to)).map(({ to, label, icon: Icon }) => (
          <MoreRow key={to} to={to} icon={<Icon size={20} />} label={label} />
        ))}
      </div>
    </div>
  )
}

function MoreRow({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink to={to} className="flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 last:border-0 dark:border-slate-800">
      <span className="text-brand-600 dark:text-brand-300">{icon}</span>
      <span className="font-medium">{label}</span>
    </NavLink>
  )
}
