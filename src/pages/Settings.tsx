import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { PROFILE } from '../domain/blueprint'
import { QUESTIONS, RECALL_PROMPTS, LESSONS } from '../domain/content'
import type { Settings } from '../domain/types'
import { formatDate, today as todayStr, weekdayShort } from '../engine/dates'
import { buildStudyCalendarIcs, downloadFile } from '../engine/ics'
import { cloudConfigured } from '../cloud/supabase'
import { deleteCloudData, signInWithEmail, signOut, syncNow, useSyncInfo } from '../cloud/sync'
import { disableReminders, enableReminders, isIOS, isStandalone, pushCapability, sendTestNotification, syncReminderPrefs } from '../cloud/push'
import { updateSettings } from '../state/actions'
import { useDerived } from '../state/derived'
import { defaultState, mergeStates, normaliseState } from '../state/model'
import { getState, replaceState } from '../state/store'
import { Badge, Button, Card, Notice, PageHeader, Segmented } from '../ui/components'
import { cx } from '../ui/style'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const inputCls = 'min-h-11 rounded-xl bg-white px-3 ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700'

export default function SettingsPage() {
  const d = useDerived()
  const s = d.state.settings
  const location = useLocation()
  const sync = useSyncInfo()

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView()
  }, [location.hash])

  function save(patch: Partial<Settings>) {
    updateSettings(patch)
    void syncReminderPrefs(getState(), d.nextTopic.objectiveId)
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <h2 className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Study schedule</h2>
      <Card>
        <Row label="Session time" hint="Local time for reminders and the calendar">
          <input type="time" value={s.studyTime} onChange={(e) => e.target.value && save({ studyTime: e.target.value })} className={inputCls} aria-label="Session time" />
        </Row>
        <Row label="Study days">
          <div className="flex gap-1" role="group" aria-label="Study days">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const on = s.studyDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => save({ studyDays: on ? s.studyDays.filter((x) => x !== day) : [...s.studyDays, day].sort() })}
                  className={cx('size-10 rounded-lg text-xs font-semibold ring-1', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-300 dark:bg-slate-900 dark:ring-slate-700')}
                >
                  {weekdayShort(day).slice(0, 2)}
                </button>
              )
            })}
          </div>
        </Row>
        <Row label="Target exam date" hint="Book only when readiness is demonstrated">
          <input type="date" value={s.targetDate} min={todayStr()} onChange={(e) => e.target.value && save({ targetDate: e.target.value })} className={inputCls} aria-label="Target exam date" />
        </Row>
        <Row label="Stage lengths (minutes)" hint="Recall / learn / practice">
          <div className="flex gap-1.5">
            {(['recall', 'learn', 'practice'] as const).map((st) => (
              <input
                key={st}
                type="number"
                min={5}
                max={60}
                value={s.stageMinutes[st]}
                aria-label={`${st} minutes`}
                onChange={(e) => {
                  const v = Math.max(5, Math.min(60, Number(e.target.value) || 0))
                  save({ stageMinutes: { ...s.stageMinutes, [st]: v } })
                }}
                className={cx(inputCls, 'w-16 text-center')}
              />
            ))}
          </div>
        </Row>
      </Card>

      <Reminders />

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Account & sync</h2>
      <Card>
        {!cloudConfigured ? (
          <>
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Single-user local mode</Badge>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Your progress is saved on this device only (browser storage). It survives closing the app, but not deleting the app or clearing Safari data, and it doesn’t move between devices.
              Export a backup below. To sync across devices and enable push reminders, deploy with the free Supabase backend (README → Cloud setup).
            </p>
          </>
        ) : (
          <AccountSection syncStatus={sync.status} email={sync.email} lastSyncedAt={sync.lastSyncedAt} error={sync.error} />
        )}
      </Card>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">AI grading (optional)</h2>
      <Card>
        <Row label="Use AI to grade written recall answers" hint="Off by default. Multiple-choice grading never uses AI.">
          <input
            type="checkbox"
            className="size-6 accent-brand-600"
            checked={s.aiGrading}
            disabled={!cloudConfigured || !sync.email}
            onChange={(e) => save({ aiGrading: e.target.checked })}
            aria-label="Enable AI grading"
          />
        </Row>
        <p className="text-xs text-slate-500">
          {cloudConfigured
            ? 'Requires signing in and an Anthropic API key stored as a Supabase function secret (never in the app). Each graded answer is one small API call; the server limits usage per day. If the call fails, keyword grading is used.'
            : 'Unavailable in local mode. The built-in key-point grader works offline at no cost, and you can always adjust a grade.'}
        </p>
      </Card>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Appearance</h2>
      <Card>
        <Row label="Theme">
          <Segmented
            label="Theme"
            value={s.theme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => save({ theme: v })}
          />
        </Row>
      </Card>

      <DataSection />
      <InstallGuide />

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">About</h2>
      <Card>
        <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
          <li>
            Profile: previous attempt {PROFILE.previousAttempt.correct}/{PROFILE.previousAttempt.total} (~62%), plan start {formatDate(PROFILE.startDate)}.
          </li>
          <li>
            Content: {QUESTIONS.length} original exam-style questions, {LESSONS.length} lessons, {RECALL_PROMPTS.length} recall prompts — written for this app from the public exam objectives. No recalled or leaked exam
            questions.
          </li>
          <li>No analytics, ads or trackers. No paid service is required.</li>
          <li>Build {__APP_BUILD__}</li>
        </ul>
      </Card>
    </div>
  )
}

function Reminders() {
  const d = useDerived()
  const s = d.state.settings
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const cap = pushCapability()
  const subscribed = s.reminders.enabled
  const verified = subscribed && !!s.reminders.lastTestOk

  async function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true)
    const r = await fn()
    setMsg({ ok: r.ok, text: r.message })
    setBusy(false)
  }

  function exportIcs() {
    downloadFile('ba-exam-study-sessions.ics', buildStudyCalendarIcs(s, d.today, window.location.origin), 'text/calendar')
  }

  return (
    <>
      <h2 id="reminders" className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Reminders
      </h2>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Push reminders</span>
          {verified ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Active — test delivered {formatDate(todayStr(new Date(s.reminders.lastTestOk!)))}</Badge>
          ) : subscribed ? (
            <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">Subscribed — send a test to confirm</Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Not active</Badge>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          A server-side scheduler sends one reminder at {s.studyTime} on your study days naming tonight’s topic, plus an optional follow-up if you haven’t finished the session.
        </p>
        {cap.blocker && !subscribed && <Notice tone="warn" className="mt-3">{cap.blocker}</Notice>}
        {isIOS() && (
          <p className="mt-2 text-xs text-slate-500">
            iPhone: web push needs iOS 16.4 or later, the app installed to the Home Screen and opened from its icon ({isStandalone() ? 'you are' : 'you are not'} running installed), HTTPS, and your permission
            after tapping Enable.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {!subscribed ? (
            <Button disabled={busy || !!cap.blocker} onClick={() => run(enableReminders)}>
              Enable reminders
            </Button>
          ) : (
            <>
              <Button disabled={busy} onClick={() => run(sendTestNotification)}>
                Send test notification
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => run(disableReminders)}>
                Turn off
              </Button>
            </>
          )}
        </div>
        {msg && (
          <Notice tone={msg.ok ? 'success' : 'warn'} className="mt-3">
            {msg.text}
          </Notice>
        )}
        {subscribed && (
          <div className="mt-3">
            <Row label="Follow-up reminder" hint="Only if tonight’s session isn’t finished">
              <div className="flex items-center gap-2">
                <select
                  value={s.reminders.followUpMinutes}
                  onChange={(e) => {
                    updateSettings({ reminders: { ...s.reminders, followUpMinutes: Number(e.target.value) } })
                    void syncReminderPrefs(getState(), d.nextTopic.objectiveId)
                  }}
                  className={inputCls}
                  aria-label="Follow-up delay"
                  disabled={!s.reminders.followUp}
                >
                  {[30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>
                      after {m} min
                    </option>
                  ))}
                </select>
                <input
                  type="checkbox"
                  className="size-6 accent-brand-600"
                  checked={s.reminders.followUp}
                  onChange={(e) => {
                    updateSettings({ reminders: { ...s.reminders, followUp: e.target.checked } })
                    void syncReminderPrefs(getState(), d.nextTopic.objectiveId)
                  }}
                  aria-label="Follow-up reminder on"
                />
              </div>
            </Row>
            <Row label="Pause reminders until" hint="Inclusive; leave empty to keep them on">
              <input
                type="date"
                value={s.reminders.pausedUntil ?? ''}
                min={todayStr()}
                onChange={(e) => {
                  updateSettings({ reminders: { ...s.reminders, pausedUntil: e.target.value || undefined } })
                  void syncReminderPrefs(getState(), d.nextTopic.objectiveId)
                }}
                className={inputCls}
                aria-label="Pause reminders until"
              />
            </Row>
          </div>
        )}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="font-semibold">Calendar reminder (works everywhere, no server)</div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Adds a repeating {s.studyTime} event on your study days until {formatDate(s.targetDate)} with an alert, plus a marker on the exam date. Open the file on your iPhone and tap Add All.
          </p>
          <Button variant="secondary" className="mt-2" onClick={exportIcs}>
            Download calendar file (.ics)
          </Button>
        </div>
      </Card>
    </>
  )
}

function AccountSection({ syncStatus, email, lastSyncedAt, error }: { syncStatus: string; email: string | null; lastSyncedAt: number | null; error: string | null }) {
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  if (!email) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const r = await signInWithEmail(input.trim())
          setMsg(r.message)
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Currently saving on this device only. Sign in with an email link to back up progress, sync between iPhone and desktop, and enable push reminders. Existing local progress is merged into
          your account.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="email" required value={input} onChange={(e) => setInput(e.target.value)} placeholder="you@example.com" className={cx(inputCls, 'flex-1')} aria-label="Email" autoComplete="email" />
          <Button type="submit">Email me a sign-in link</Button>
        </div>
        {msg && <Notice className="mt-3">{msg}</Notice>}
      </form>
    )
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{email}</span>
        <Badge
          className={cx(
            syncStatus === 'synced' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
            syncStatus === 'error' && 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
            (syncStatus === 'syncing' || syncStatus === 'offline' || syncStatus === 'signed-out') && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          {syncStatus}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-slate-500">{lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Not synced yet'}</p>
      {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={() => void syncNow()}>
          Sync now
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  )
}

function DataSection() {
  const sync = useSyncInfo()
  const [msg, setMsg] = useState<string | null>(null)

  function exportData() {
    downloadFile(`ba-coach-backup-${todayStr()}.json`, JSON.stringify(getState(), null, 2), 'application/json')
  }

  function importData(file: File) {
    file
      .text()
      .then((text) => {
        const incoming = normaliseState(JSON.parse(text))
        replaceState(mergeStates(getState(), incoming))
        setMsg(`Imported and merged ${incoming.attempts.length} answers and ${incoming.sessions.length} sessions.`)
      })
      .catch(() => setMsg('That file could not be read as a BA Coach backup.'))
  }

  return (
    <>
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Your data</h2>
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Stored: your answers, session timings, notes and settings. Not stored: anything else. {sync.email ? 'Synced to your Supabase project.' : 'Kept on this device only.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportData}>
            Export study history (JSON)
          </Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-[15px] font-semibold text-brand-700 ring-1 ring-slate-300 hover:bg-slate-50 dark:text-brand-300 dark:ring-slate-700 dark:hover:bg-slate-800">
            Import backup
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm('Delete ALL study history on this device? Export a backup first if you might want it.')) return
              const fresh = defaultState()
              replaceState({ ...fresh, settingsUpdatedAt: Date.now() }, { silent: true })
              setMsg('Local data deleted.')
            }}
          >
            Delete local data
          </Button>
          {sync.email && (
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm('Delete your study data, reminder settings and push subscriptions from the cloud? Local data on this device is kept.')) return
                const r = await deleteCloudData()
                setMsg(r.message)
              }}
            >
              Delete cloud data
            </Button>
          )}
        </div>
        {msg && <Notice className="mt-3">{msg}</Notice>}
      </Card>
    </>
  )
}

function InstallGuide() {
  const standalone = isStandalone()
  return (
    <>
      <h2 id="install" className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Install on iPhone
      </h2>
      <Card>
        {standalone ? (
          <p className="text-sm">✓ You’re using the installed app.</p>
        ) : (
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Open this site in Safari (other iPhone browsers also offer “Add to Home Screen” on iOS 16.4+).</li>
            <li>Tap the Share button (square with an up arrow).</li>
            <li>Scroll and tap “Add to Home Screen”, keep “Open as Web App” on, then tap Add.</li>
            <li>Open BA Coach from the new icon. It runs full-screen, works offline, and can receive reminders.</li>
          </ol>
        )}
        <p className="mt-2 text-xs text-slate-500">Lessons, questions and your progress are cached on the device; external Trailhead pages need a connection.</p>
      </Card>
    </>
  )
}
