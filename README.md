# BA Exam Coach

A mobile-first Progressive Web App that coaches one person through the **Salesforce Certified Business Analyst** exam, targeting **November 24, 2026**.

When you open it, it tells you exactly what to do next. Each night it runs a guided **10–25–25 session**:

1. **10-minute active recall.** It quizzes you on due reviews and past mistakes and grades each answer 0–4.
2. **25-minute guided lesson.** You get one topic with a direct link to the official resource and learning checkpoints.
3. **25-minute exam practice.** You answer original scenario questions and get explanations for every option.

Around the sessions it keeps mastery scores per exam objective, schedules spaced reviews, keeps a mistake notebook, runs mock exams, and tells you honestly whether you're ready.

> **Status:** the core app is complete and tested (372 unit tests and 17 browser end-to-end checks). Three things need accounts or verification that couldn't be done from the build environment; they're listed under [Remaining setup and known limitations](#remaining-setup-and-known-limitations):
> - cloud sync and push reminders need a free Supabase project;
> - optional AI grading needs an Anthropic API key;
> - the Salesforce resource links still need a final check.

---

## Contents

- [Quick start (local)](#quick-start-local)
- [What's implemented](#whats-implemented)
- [Architecture and trade-offs](#architecture-and-trade-offs)
- [Exam blueprint and sources](#exam-blueprint-and-sources)
- [Deploy (free, HTTPS)](#deploy-free-https)
- [Install on your iPhone](#install-on-your-iphone)
- [Cloud sync and push reminders (Supabase)](#cloud-sync-and-push-reminders-supabase)
- [Optional AI grading](#optional-ai-grading)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [How the adaptive engine works](#how-the-adaptive-engine-works)
- [Costs](#costs)
- [Privacy and your data](#privacy-and-your-data)
- [Remaining setup and known limitations](#remaining-setup-and-known-limitations)
- [Project structure](#project-structure)

---

## Quick start (local)

Requirements: Node.js 20+ (built and tested with Node 22).

```bash
npm install
npm run dev          # http://localhost:5173
```

The app runs fully in **single-user local mode** with no backend and no keys: progress is saved in the browser.

Production build and preview (includes the service worker, so offline mode works):

```bash
npm run build
npm run preview      # http://localhost:4173
```

## What's implemented

| Requirement | Status |
|---|---|
| Your profile and baseline (37/60, section scores) preloaded | ✅ `src/domain/blueprint.ts` |
| 18-question diagnostic across all six sections | ✅ `/diagnostic` |
| App picks the next topic, with the reasons shown | ✅ transparent priority score (`src/engine/planner.ts`) |
| 10–25–25 session with timers based on timestamps, so they survive a locked screen or backgrounded app | ✅ `/session`, `src/engine/timer.ts` |
| Pause, resume, finish early; picks up where you left off after closing the app | ✅ tested end-to-end |
| Recall graded 0–4: what you got right, what's missing, a model answer; you can adjust the grade | ✅ |
| Confidence tracked separately from correctness; confident wrong answers flagged | ✅ |
| Lessons: objective, original summary, Salesforce example, direct official link, focus section, checkpoints, knowledge check | ✅ one lesson for each of the 19 objectives |
| 152 original exam-style questions (20–30 per section), each with an explanation for every option | ✅ validated by tests |
| Mastery per objective, spaced repetition, adaptive calendar | ✅ |
| Mistake notebook: search, filters, notes, corrective exercises, "Review my mistakes" | ✅ |
| Quick, section, weak-area and mistake quizzes; half mock (30 questions / 53 min); full mock (60 / 105 min); readiness assessment | ✅ |
| Raw practice %, weighted study score and readiness kept as separate numbers; honest recommendation | ✅ |
| Calendar Oct 27 → Nov 24 with done/missed status, countdown, next session | ✅ |
| Dashboard, topic library, resource library, progress, settings; dark mode | ✅ |
| Installable PWA with icons, standalone mode and offline support | ✅ verified in Chromium; iPhone install steps below |
| Calendar-file (.ics) reminder fallback | ✅ works with no server |
| Web Push reminders scheduled on the server, with follow-up, pause, test notification and cleanup of expired subscriptions | ✅ implemented. The scheduler logic is unit-tested and the service worker's push → notification path is verified in Chromium. **Needs your Supabase project plus VAPID keys to run**; real delivery through Apple/Google push services wasn't testable from the build environment |
| Cloud sync across devices | ✅ implemented; **needs Supabase** |
| Optional AI grading of written answers | ✅ implemented and type-checked; **needs an Anthropic API key (paid)** |
| Export, import and deletion of your history | ✅ |

## Architecture and trade-offs

- **React 19 + TypeScript + Vite + Tailwind CSS 4.** The app is fully static, so it can be hosted free anywhere with HTTPS.
- **Local-first data.** Your study history is an append-only log of answers plus session and quiz records, stored in `localStorage`. Mastery, review schedules, the mistake notebook and readiness are always recomputed from that log. This keeps the logic transparent and testable, and makes cloud sync conflict-free (`mergeStates` just takes the union of the log).
- **Optional Supabase backend.** It adds three things: sign-in by email link, sync (one row of JSON per user, protected by Row Level Security), and server-side reminders. Reminders use Postgres `pg_cron`, which calls an Edge Function every 5 minutes; the function decides in your own time zone whether a reminder is due and sends Web Push. A browser tab can't wake itself at 9 p.m., which is why this runs on the server.
- **No AI by default.** Multiple-choice grading is deterministic. Recall answers are graded by matching them against key points with several accepted phrasings each, and you can always adjust the grade. AI grading is opt-in, runs only on the server, and is rate-limited.
- **Content is kept separate from logic.** Questions, lessons and prompts are typed data in `src/domain/content`. Grading and scheduling live in `src/engine`, and the UI is in `src/pages` and `src/ui`.

**Local-only vs. cloud mode:**

- **Local-only mode** needs zero setup and costs nothing, and the data never leaves your phone. But it lives only in that browser's storage. iOS can clear storage for sites you haven't used for weeks, and deleting the Home Screen app deletes it too, so export a backup occasionally.
- **Cloud mode** backs up your progress, syncs iPhone and desktop, and enables push reminders. It costs you a free Supabase account and about 20 minutes of setup.

## Exam blueprint and sources

The section weights match the official exam guide (help.salesforce.com article `005298939`) and the Trailhead *Cert Prep: Salesforce Business Analyst* module:

| Section | Weight |
|---|---|
| Customer Discovery | 17% |
| Collaboration with Stakeholders | 23% |
| Business Process Mapping | 12% |
| Requirements | 18% |
| User Stories | 18% |
| Development Support and User Acceptance | 12% |

The format is 60 scored questions plus up to 5 unscored ones, 105 minutes, and a 72% pass mark.

Objective descriptions in the app are **paraphrases**, not verbatim exam-guide text.

**How sources were checked:** the build environment's network policy **blocked** salesforce.com and trailhead.salesforce.com. No Salesforce page could be opened, so:

- Weights, format and resource URLs were confirmed against **search-engine index entries** with matching titles. These are labelled *"Link found, not opened"* in the app.
- Two user-supplied URLs (the credential page and the trailmix) and one cited module could not be independently confirmed. These are labelled *"Unverified link"*.
- Nothing is labelled *Verified*.

From your own machine:

```bash
npm run check-links   # reports ok / broken / inconclusive per URL → test-results/link-report.json
```

Trailhead often answers scripts with 403 or a login wall; the script reports those as *inconclusive*, not broken. After you open and read a page, you can change its `status` to `'reviewed'` in `src/domain/content/resources.ts`.

**All questions, lessons and recall prompts are original**, written from the public objectives. No recalled or leaked exam content is used. Tests enforce several quality rules:

- every question has exactly one key (or N keys for "Choose N");
- every wrong option has an explanation;
- there are no duplicate stems;
- the position of the correct letter is balanced;
- the correct answer is not given away by being the longest or shortest option.

## Deploy (free, HTTPS)

Any static host works. **Vercel** is the simplest:

1. Push this repository to GitHub (already done if you're reading this there).
2. At vercel.com, go to **Add New → Project**, import the repo, and keep the defaults. The framework is detected as Vite; `vercel.json` sets the build command, the SPA rewrites and the service-worker cache headers.
3. *(Cloud mode only)* add the three `VITE_*` environment variables under **Project → Settings → Environment Variables**, then redeploy.
4. You get an `https://<name>.vercel.app` URL. Vercel Hobby is free for personal use.

**Alternatives:**
- **Netlify:** `netlify.toml` is included. Import the repo; the build is `npm run build` and the publish directory is `dist`.
- **Cloudflare Pages:** use build `npm run build` and output `dist`. SPA fallback is automatic.

## Install on your iPhone

1. Open your deployed HTTPS URL in **Safari**.
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**. Keep **Open as Web App** on and tap **Add**.
3. Launch **BA Coach** from the icon. It runs full-screen, works offline after the first load, and is the only mode in which iOS allows push notifications (iOS 16.4 or later).

## Cloud sync and push reminders (Supabase)

You need a free account at supabase.com and the Supabase CLI (`npm i -g supabase`, or `npx supabase`).

1. **Create a project** in the Supabase dashboard. Note the **Project URL**, the **anon public key** (Settings → API) and the project ref.
2. **Create the tables:** open the SQL editor and run `supabase/migrations/20261027000000_init.sql`, or run `supabase link --project-ref <ref>` then `supabase db push`.
3. **Configure auth:** under Authentication → URL Configuration, set **Site URL** to your deployed URL and add `https://<your-app>/settings` to **Redirect URLs**. Email sign-in links are on by default.
4. **Generate VAPID keys** for Web Push. Keep the private key secret.
   ```bash
   npx web-push generate-vapid-keys
   ```
5. **Set the function secrets.** These are server-only and never go in the app. `CRON_SECRET` is any long random string.
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:you@example.com
   supabase secrets set CRON_SECRET=<long-random-string> APP_ORIGIN=https://<your-app>
   ```
6. **Deploy the functions:**
   ```bash
   supabase functions deploy send-reminders --no-verify-jwt
   supabase functions deploy push-test
   supabase functions deploy grade-recall      # optional, for AI grading
   ```
7. **Schedule reminders:** edit `supabase/cron.sql` (project ref and the same `CRON_SECRET`) and run it once in the SQL editor. This creates a `pg_cron` job that runs every 5 minutes.
8. **Set the app's environment variables** in your host and redeploy: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (the *public* VAPID key).
9. **On your iPhone**, in the installed app:
   1. Go to **Settings → Account** and sign in with the email link. Open the link on the same device.
   2. Go to **Settings → Reminders**, tap **Enable reminders**, and allow notifications.
   3. Tap **Send test notification**.

   Reminders show as **Active** only after a test is delivered.

**How reminders behave:**
- One reminder at your chosen time on study days, naming tonight's topic. Tapping it opens the session.
- One optional follow-up 30–90 minutes later, only if the session isn't finished.
- Nothing is sent if you already finished, if reminders are paused, or if the scheduler is more than 90 minutes late.
- Expired subscriptions are deleted automatically.
- Changing the time, days or pause date in Settings syncs to the server.

**If push isn't possible** (older iOS, denied permission, no backend), use **Settings → Reminders → Download calendar file**. It adds a repeating study event with an alert to your iPhone calendar.

## Optional AI grading

Off by default. When enabled (Settings → AI grading, after signing in), written recall answers are graded by the `grade-recall` Edge Function, which calls Claude with a strict output schema. If the call fails, is rate-limited or is refused, the app falls back to keyword grading automatically.

```bash
supabase secrets set ANTHROPIC_API_KEY=<key>
# optional:
supabase secrets set AI_DAILY_LIMIT=60            # calls per user per day (default 60)
supabase secrets set AI_GRADING_MODEL=claude-opus-5-5   # default; any current Claude model ID
```

The Anthropic API is **paid**, so only add a key if you approve the cost (see [Costs](#costs)). The default model is Claude Opus 5.5 at low effort. For lower cost you can set `AI_GRADING_MODEL=claude-haiku-5-5`.

## Environment variables

| Name | Where | Secret? | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Host / `.env.local` | No | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Host / `.env.local` | No (protected by RLS) | Browser access to your own rows |
| `VITE_VAPID_PUBLIC_KEY` | Host / `.env.local` | No | Web Push subscription |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Supabase secrets | **Yes** (private key) | Sending push |
| `CRON_SECRET` | Supabase secrets and `cron.sql` | **Yes** | Authenticates the scheduler |
| `APP_ORIGIN` | Supabase secrets | No | CORS allow-list for your app URL |
| `ANTHROPIC_API_KEY` | Supabase secrets | **Yes** | Optional AI grading |
| `AI_DAILY_LIMIT`, `AI_GRADING_MODEL` | Supabase secrets | No | AI rate limit and model |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions by Supabase automatically; never put the service-role key in the app. See `.env.example`.

## Testing

```bash
npm run typecheck   # TypeScript (strict)
npm run lint        # oxlint
npm test            # 372 unit tests: content integrity, grading, timers, SRS, mastery,
                    #   planner/calendar, selection/mock freshness, readiness, sync merge,
                    #   reminder scheduling incl. time zones and DST
npm run build       # production build + service worker
npm run test:e2e    # 17 browser checks on an iPhone-sized viewport (needs a build first)
npm run check       # typecheck + lint + unit tests + build
```

`npm run test:e2e` uses Playwright's Chromium and writes screenshots to `test-results/`. It checks:
- diagnostic → session (recall → lesson → knowledge check → practice);
- reload mid-session with the same question and preserved time;
- pause, resume and finish early;
- mistake notebook entries;
- a half mock;
- persistence after reopening;
- every screen rendering;
- the `.ics` export;
- offline loading through the service worker;
- a simulated push message (via Chrome DevTools) producing the reminder notification;
- the manifest;
- desktop dark mode;
- no uncaught errors.

To type-check the Edge Functions:

```bash
cd supabase/functions && npx deno@2 check --config deno.json send-reminders/index.ts push-test/index.ts grade-recall/index.ts
```

CI (`.github/workflows/ci.yml`) runs all of the above except e2e.

## How the adaptive engine works

**Mastery** is tracked per objective (19 objectives). It's a recency-weighted average of your last 20 results, where the newest counts most. The levels are:

| Level | Mastery |
|---|---|
| New | no evidence yet |
| Learning | below 60% |
| Developing | 60–74% |
| Nearly ready | 75–84% |
| Strong | 85–94% |
| Demonstrated mastery | 95% or more, across at least 10 distinct items, including a correct review at least 3 days later |

These are study-management thresholds, not score predictions.

**Estimate** blends your evidence with your August section score, discounted 10% for the break and counted as 3 answers' worth, so your own answers dominate quickly. The **weighted study score** is the sum of section estimates times the official weights.

**Spaced repetition** replays your daily results:
- below 60% → review tomorrow;
- 60–79% → hold at 1–3 days;
- 80% or more → 1 day, then 3, then growing intervals, capped at 14 days so strong topics come back before the exam.

**Topic choice** multiplies these factors, and each one is shown in the app as a reason:
- official weight;
- weakness;
- days since last taught;
- open mistakes;
- how many other objectives build on this one;
- today's calendar plan;
- whether a spaced review is due;
- coverage pressure (so every objective is taught before the target date);
- an anti-repeat penalty (so one weak topic can't take every night).

A test simulates every study day and confirms all 19 objectives get covered.

**Question selection:**
- Unseen questions come first.
- Previously wrong questions come back as clearly labelled retries after at least one day.
- 63 questions are **reserved for mocks**, so your first mock exams are genuinely fresh.
- Each mock reports its "freshness".

**Readiness** is "Ready to book" only when **all** of these hold:
- at least 60 fresh mock questions answered at 80% or better;
- the latest mock at 80% or better;
- weighted study score at 80% or better;
- every section at 70% or better;
- every objective studied at least once.

Near the target date, if those checks fail, the app says plainly that you should reschedule rather than sit the exam.

## Costs

| Item | Cost |
|---|---|
| Hosting (Vercel Hobby, Netlify or Cloudflare Pages free tiers) | $0 |
| Supabase free tier (auth, database, Edge Functions, pg_cron) | $0. Free projects pause after about a week of inactivity, and you resume them from the dashboard. |
| Web Push (Apple/Google push services) | $0 |
| AI grading (optional, off by default) | Roughly $0.01 per graded answer with Claude Opus 5.5 at low effort. Five recall answers a night is about $1–2 for the whole study period. Haiku 5.5 is far cheaper. Capped by `AI_DAILY_LIMIT`. |

There are no subscriptions, analytics, trackers or ads.

## Privacy and your data

- The app stores only your answers, session timings, notes and settings.
- **Settings → Your data** lets you export everything as JSON, import a backup (it merges), delete local data, and delete cloud data (study state, reminder settings and push subscriptions).
- Cloud tables use Row Level Security, so each user can read and write only their own rows.
- The service-role key and all API keys stay in Supabase secrets.
- Edge Functions validate their input, check authentication, and are rate-limited: one test notification per 20 seconds, and a daily cap on AI calls.

## Remaining setup and known limitations

1. **Push reminders are not yet proven on a real device.** Delivery depends on your Supabase project, VAPID keys, and Apple's push service, none of which were reachable from the build environment. The scheduling logic is unit-tested (time zones, DST, follow-ups, pauses), the functions type-check against the real SDKs, and the service worker's push handler is verified in Chromium. A local Supabase stack couldn't be started because container image downloads were blocked. Run **Send test notification** after setup; the app only shows reminders as *Active* once a test succeeds.
2. **Salesforce links haven't been opened.** Salesforce/Trailhead pages were blocked during the build (see [Exam blueprint and sources](#exam-blueprint-and-sources)). Run `npm run check-links` and spot-check the exam guide yourself. One Trailhead unit slug is spelled `reivew-collaboration-with-stakeholders` in Salesforce's own index; if it ever 404s, the module page link still works.
3. **The question bank is finite.** It holds 152 curated questions plus 40 lesson checks (and 60 recall prompts). Two half mocks (or one full mock) can be completely fresh; after that, mocks reuse questions, the app shows lower freshness, and readiness relies on fresh-question accuracy. AI question generation was deliberately **not** added, because unreviewed generated questions can't be guaranteed accurate. Adding more curated questions in `src/domain/content/questions/*.ts` is the recommended way to extend.
4. **Recall auto-grading matches key points, not reasoning.** It accepts many phrasings but can't judge the logic of an answer. Adjust the grade honestly, or enable AI grading.
5. **Local-only mode** keeps data in Safari's storage for this site. Export a backup now and then, or use cloud sync.
6. **The full 105-minute mock doesn't fit a 60-minute weeknight.** The plan uses two half mocks on Nov 16 and 18 and suggests a full mock on the weekend of Nov 21–22.

## Project structure

```
src/
  domain/            blueprint (weights, objectives, profile), types
    content/         questions/*, lessons/*, recall prompts, resource registry
  engine/            grading, mastery + SRS, mistakes, planner/calendar,
                     selection, readiness, timer, dates, ics
  state/             store (localStorage), actions, derived data, merge
  cloud/             Supabase client, sync, push, AI grading client
  pages/             Dashboard, Session, Quiz, Practice/Mock/Diagnostic, Mistakes,
                     Topics/Resources, Progress, Calendar, Settings
  ui/                components, layout, question/recall cards, lesson view
  sw.ts              service worker (precache, offline, push, notification click)
supabase/
  migrations/        tables + RLS
  functions/         send-reminders, push-test, grade-recall, _shared
  cron.sql           pg_cron schedule (run once)
tests/               unit tests (Vitest) and e2e (Playwright)
scripts/             link checker, icon generator
```
