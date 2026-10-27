// End-to-end smoke test against the production build (`npm run build` first).
// Starts `vite preview`, drives the app in Chromium with an iPhone-sized viewport,
// and saves screenshots to test-results/. Exits non-zero on the first failure.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium, devices } = require('playwright')

const PORT = 4179
const BASE = `http://localhost:${PORT}`
const OUT = new URL('../../test-results/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
const stop = () => server.kill('SIGTERM')
process.on('exit', stop)

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

let step = 0
async function check(name, fn) {
  step++
  process.stdout.write(`${String(step).padStart(2)}. ${name} … `)
  try {
    await fn()
    console.log('ok')
  } catch (e) {
    console.log('FAILED')
    throw e
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function answerCurrentQuestion(page) {
  // Pick the required number of options (first N) and submit if there is a submit button.
  const badge = page.getByText(/^Choose \d$/)
  const n = (await badge.count()) ? Number((await badge.first().textContent()).match(/\d/)[0]) : 1
  const inputs = page.locator('fieldset input')
  for (let i = 0; i < n; i++) await inputs.nth(i).check()
  const conf = page.getByRole('radio', { name: 'Fairly sure' })
  if (await conf.count()) await conf.first().click()
  const submit = page.getByRole('button', { name: 'Submit answer' })
  if (await submit.count()) await submit.click()
}

await waitForServer()
// Full Chromium in new headless mode (the headless shell can't grant notification permission).
const browser = await chromium.launch({ channel: 'chromium' })
const iphone = devices['iPhone 13']
const context = await browser.newContext({ ...iphone, acceptDownloads: true })
const page = await context.newPage()
page.on('dialog', (d) => d.accept())
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

try {
  await check('dashboard loads with diagnostic as next best action', async () => {
    await page.goto(BASE)
    await page.getByText('Start with a 15-minute diagnostic').waitFor()
    assert(await page.getByText('days to Nov 24').isVisible(), 'countdown missing')
    await page.screenshot({ path: `${OUT}01-dashboard-iphone.png`, fullPage: true })
  })

  await check('diagnostic: 18 questions, exam mode, submit, results', async () => {
    await page.getByRole('button', { name: 'Take the diagnostic' }).click()
    await page.getByRole('button', { name: 'Start diagnostic' }).click()
    await page.getByText('Question 1 of 18').waitFor()
    for (let i = 0; i < 18; i++) {
      await answerCurrentQuestion(page)
      if (i < 17) await page.getByRole('button', { name: /^Next/ }).click()
    }
    await page.screenshot({ path: `${OUT}02-diagnostic-question.png`, fullPage: true })
    await page.getByRole('button', { name: 'Submit exam' }).click()
    await page.getByText('Diagnostic — results').waitFor()
    await page.screenshot({ path: `${OUT}03-diagnostic-results.png`, fullPage: true })
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('ba-coach:v1')).attempts.length)
    assert(n === 18, `expected 18 attempts, got ${n}`)
  })

  await check('session: recall stage hides answer until submit, then grades 0–4', async () => {
    await page.goto(`${BASE}/`)
    await page.getByRole('button', { name: 'Start session' }).click()
    await page.getByText('Prompt 1 of').waitFor()
    assert((await page.getByText('Model answer', { exact: true }).count()) === 0, 'model answer visible before submit')
    await page.locator('textarea').fill('I would agree the scope and boundaries first, identify the process owner and stakeholders, and confirm the business goals before mapping detail.')
    const conf = page.getByRole('radio', { name: 'Fairly sure' })
    if (await conf.count()) await conf.click()
    await page.getByRole('button', { name: 'Submit answer' }).click()
    await page.getByText('Model answer', { exact: true }).waitFor()
    await page.getByText(/^[0-4]\/4$/).waitFor()
    await page.screenshot({ path: `${OUT}04-recall-graded.png`, fullPage: true })
    await page.getByRole('button', { name: 'Next' }).click()
  })

  await check('session: learning stage shows lesson, official resource link and checkpoints', async () => {
    await page.getByText('Skip to guided learning').click()
    await page.getByText('Coach summary').waitFor()
    const link = page.getByRole('link', { name: /Open resource/ }).first()
    const href = await link.getAttribute('href')
    assert(href?.startsWith('https://'), 'resource link missing')
    assert((await link.getAttribute('target')) === '_blank', 'resource should open in a new tab')
    await page.locator('button[aria-pressed]').first().click()
    await page.screenshot({ path: `${OUT}05-lesson.png`, fullPage: true })
    await page.getByRole('button', { name: /start the knowledge check/ }).click()
    for (let i = 0; i < 2; i++) {
      await answerCurrentQuestion(page)
      await page.getByText(/Why the answer is best/).waitFor()
      await page.getByRole('button', { name: 'Next', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Start practice' }).click()
  })

  await check('session: practice gives feedback with distractor explanations', async () => {
    await page.getByText(/Question 1 of \d+/).waitFor()
    await answerCurrentQuestion(page)
    await page.getByText('Why the others are weaker').waitFor()
    await page.screenshot({ path: `${OUT}06-practice-feedback.png`, fullPage: true })
    await page.getByRole('button', { name: 'Next question' }).click()
    await page.getByText(/Question 2 of \d+/).waitFor()
  })

  await check('session survives reload and resumes at the same question with elapsed time kept', async () => {
    const before = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ba-coach:v1')).sessions.at(-1)
      return { idx: s.practiceIndex, recallMs: s.timers.recall.accumulatedMs }
    })
    await page.reload()
    await page.getByText(/Question 2 of \d+/).waitFor()
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ba-coach:v1')).sessions.at(-1)
      return { idx: s.practiceIndex, recallMs: s.timers.recall.accumulatedMs, running: s.timers.practice.runningSince !== undefined }
    })
    assert(after.idx === before.idx, 'practice index not preserved')
    assert(after.recallMs === before.recallMs && after.recallMs > 0, 'recall time lost')
    assert(after.running, 'practice timer should resume')
  })

  await check('pause and finish early → summary with scores and next focus', async () => {
    await page.getByRole('button', { name: 'Pause session' }).click()
    await page.getByText('Paused — your place is saved').waitFor()
    await page.getByRole('button', { name: 'Resume session' }).click()
    await page.getByRole('button', { name: 'Finish early' }).click()
    await page.getByText('Session complete').waitFor()
    await page.getByText('Next session’s focus').waitFor()
    await page.screenshot({ path: `${OUT}07-session-summary.png`, fullPage: true })
  })

  await check('mistake notebook lists wrong answers with principle and corrective exercise', async () => {
    await page.goto(`${BASE}/mistakes`)
    await page.getByRole('heading', { name: 'Mistake notebook' }).waitFor()
    const count = await page.getByText('Principle to remember').count()
    assert(count > 0, 'expected at least one mistake (first-option answering is usually wrong)')
    await page.screenshot({ path: `${OUT}08-mistakes.png`, fullPage: true })
  })

  await check('half mock: timed, exam mode, submit with unanswered questions', async () => {
    await page.goto(`${BASE}/mock`)
    await page.getByRole('button', { name: 'Start half mock' }).click()
    await page.getByText('Question 1 of 30').waitFor()
    await answerCurrentQuestion(page)
    await page.screenshot({ path: `${OUT}09-mock-question.png`, fullPage: true })
    await page.getByRole('button', { name: 'Submit exam now' }).click()
    await page.getByText('Half mock exam — results').waitFor()
    await page.getByText('Fresh questions', { exact: true }).waitFor()
    await page.screenshot({ path: `${OUT}10-mock-results.png`, fullPage: true })
  })

  await check('progress persists after closing and reopening', async () => {
    const p2 = await context.newPage()
    await p2.goto(BASE)
    await p2.getByText('Done for today ✓').waitFor()
    const sessions = await p2.getByText('Sessions done').locator('..').textContent()
    assert(sessions.includes('1'), 'session count not persisted')
    await p2.close()
  })

  await check('progress, topics, resources, calendar and settings render', async () => {
    for (const [path, text, shot] of [
      ['/progress', 'Readiness checks', '11-progress'],
      ['/topics', 'Topic library', '12-topics'],
      ['/topics/BPM2', 'Coach summary', '13-topic-detail'],
      ['/resources', 'Resource library', '14-resources'],
      ['/calendar', 'Study calendar', '15-calendar'],
      ['/settings', 'Push reminders', '16-settings'],
    ]) {
      await page.goto(`${BASE}${path}`)
      await page.getByText(text).first().waitFor()
      await page.screenshot({ path: `${OUT}${shot}.png`, fullPage: true })
    }
  })

  await check('calendar reminder downloads a valid .ics', async () => {
    await page.goto(`${BASE}/calendar`)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Add to my calendar/ }).click()])
    const path = await download.path()
    const text = (await import('node:fs')).readFileSync(path, 'utf8')
    assert(text.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') && text.includes('BEGIN:VALARM'), 'ics content invalid')
  })

  await check('works offline after first load (service worker)', async () => {
    await page.goto(BASE)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await context.setOffline(true)
    await page.goto(`${BASE}/topics/UA2`)
    await page.getByText('Coach summary').waitFor()
    await page.getByText('Offline — lessons').waitFor()
    await page.screenshot({ path: `${OUT}17-offline.png`, fullPage: true })
    await context.setOffline(false)
  })

  await check('service worker shows a reminder notification for a push message', async () => {
    await context.grantPermissions(['notifications'], { origin: BASE })
    const cdp = await context.newCDPSession(page)
    const registrationId = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no SW registration seen')), 10000)
      cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
        const reg = e.registrations.find((r) => r.scopeURL.startsWith(BASE) && !r.isDeleted)
        if (reg) {
          clearTimeout(timer)
          resolve(reg.registrationId)
        }
      })
    })
    await cdp.send('ServiceWorker.enable')
    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin: BASE,
      registrationId: await registrationId,
      data: JSON.stringify({ title: 'Tonight: Planning UAT', body: '60 minutes: 10 recall · 25 learn · 25 practice.', url: '/session', tag: 'ba-reminder' }),
    })
    let shown = []
    for (let i = 0; i < 20 && !shown.length; i++) {
      await new Promise((r) => setTimeout(r, 250))
      shown = await page.evaluate(async () =>
        (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => `${n.title}|${n.body}|${n.data?.url}`),
      )
    }
    assert(shown.some((t) => t.startsWith('Tonight: Planning UAT|60 minutes') && t.endsWith('|/session')), `notification not shown: ${shown.join(', ')}`)
  })

  await check('manifest is installable (standalone, icons)', async () => {
    const res = await page.request.get(`${BASE}/manifest.webmanifest`)
    const m = await res.json()
    assert(m.display === 'standalone' && m.icons.some((i) => i.sizes === '512x512'), 'manifest incomplete')
    const icon = await page.request.get(`${BASE}/icons/apple-touch-icon.png`)
    assert(icon.ok(), 'apple-touch-icon missing')
  })

  await check('desktop layout and dark mode render', async () => {
    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })
    const p = await desk.newPage()
    await p.goto(BASE)
    await p.getByText('BA Exam Coach').first().waitFor()
    await p.screenshot({ path: `${OUT}18-desktop-dark.png`, fullPage: true })
    const dark = await p.evaluate(() => document.documentElement.classList.contains('dark'))
    assert(dark, 'dark mode not applied')
    await desk.close()
  })

  await check('no uncaught page errors', async () => {
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`)
  })
  console.log(`\nAll ${step} e2e checks passed. Screenshots in test-results/`)
} finally {
  await browser.close()
  stop()
}
