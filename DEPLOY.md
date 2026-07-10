# Deploy — SO Recruitment (scraper + auto-post, one console)

Three pieces, one shared Postgres. The web is serverless; the browser bots are NOT
(they need a real, always-on machine).

```
┌ Vercel ─────────────┐     ┌ Worker host (always-on VM/PC) ───────────────┐
│ web/  (Next.js)      │     │ Docker: runner pool (scrape, headful+Xvfb)    │
│  Azure AD login      │─┐   │ autopost server + its post/collect workers    │
│  choose Scraping /   │ │   │ (Chromium headful; FB posting engine)         │
│  Auto-Post (iframe)  │ │   └───────────────────────────────────────────────┘
└──────────────────────┘ └──── shared Postgres (94.74.115.204, ocr_service) ───┘
```

Why split: Vercel is serverless (function timeouts, no persistent process, no headful
browser) — it can host the console but **cannot run the bots**. The bots run on the
worker host.

## 1) Postgres (already exists)
External at `94.74.115.204/ocr_service`. Two schemas: `so-candidate-data` (scraper),
`so_autopost_jobs` (autopost). Apply scraper migrations once:
```
docker compose run --rm migrate      # runs src/db/migrate.js (schema…005)
```

## 2) Worker host — scrape runner pool (Docker)
Runs the unified `work_queue` runner. Headful Chromium via Xvfb.
```
cp .env.example .env      # set PG*/DATABASE_URL, DB_SCHEMA, APP_ENCRYPTION_KEY, JOBBKK_*
docker compose build
docker compose up -d --scale runner=4      # 4 slots; scale up to #accounts
docker compose logs -f runner
```
- One container = one slot. Per-connector DB lock ⇒ one account runs one job at a
  time; different accounts run in parallel across containers.
- `.env` must include `APP_ENCRYPTION_KEY` (to decrypt connector passwords) + PG creds.

## 3) Auto-post server + FB workers (worker host)
Autopost keeps its own queue/worker/scheduler (do NOT route FB posting through the
scrape runner). Run it on the same host:
```
cd autopost && npm ci && npm start            # Express UI + API (default PORT 3000/3100)
npm run worker:post                            # FB posting worker (spawns Chromium)
```
Expose the autopost server URL to the console via `AUTOPOST_URL` (below).

Anti-block posting engine env (worker host — see `autopost/.env.example`):
- `WORKER_CONCURRENCY=15` → # of Chrome open in parallel = accounts posting at once.
  Facebook headful Chrome ≈ 0.8–1.2 GB each; **32 GB RAM → start 15, watch Task
  Manager, push toward ~18–20 if stable.** Parallel is speed-only (shared IP), the
  block protection is the cap/rotation/breaker below.
- `POST_DAILY_CAP=15` (per account/day), `POST_REPOST_MIN_GAP_DAYS=2`,
  `POST_FAIL_STREAK_LIMIT=5` + `POST_PAUSE_HOURS=24` (circuit breaker).
- `AUTO_POST_HOUR=8` `AUTO_POST_MINUTE=0` → worker enqueues the daily run itself at
  08:00 Asia/Bangkok **every day incl. weekends** (the Vercel scheduler never fires).
- **Access gate:** set `AUTOPOST_ACCESS_TOKEN` here AND the same value on the console
  (below) — closes the public AUTO-POST URL so only the logged-in console can reach it.

## 4) Console (Vercel)
Deploy `web/` to Vercel. Env vars:
- `AUTOPOST_URL` → the autopost server URL on the worker host (e.g. `https://autopost.internal`).
  The `/autopost` tab embeds it in an iframe.
- `AUTOPOST_ACCESS_TOKEN` → same value as the worker host's, so the console can hand the
  iframe a one-time token (swapped for an HttpOnly cookie). Without it the AUTO-POST URL
  is publicly reachable.
- Azure AD: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
- DB: `DATABASE_URL` / `PG*`, `DB_SCHEMA=so-candidate-data`, `APP_ENCRYPTION_KEY`.

Run-now (“Create & Start”) enqueues into `work_queue`; with the runner pool up, jobs
are picked up within a few seconds.

## ⚠️ IP / anti-ban (important)
- **Facebook** flags automation + many accounts from one datacenter IP. Give each FB
  account a **stable residential proxy** (per autopost worker/account). Prefer an
  office/residential IP for the worker host over a raw cloud VPS.
- **JobBKK** login is happier on non-datacenter IPs too and is intermittently flaky
  (retry recovers). If the Docker runner on a cloud host struggles, run the runner on
  an office machine or via a residential proxy.
- Keep the human-like delays (autopost `humanBehavior`, scraper rate limits) — they are
  the per-account speed floor that avoids bans.

## Notes
- `worker.lock` is no longer the safety net — the per-connector DB lock is. Multiple
  runner containers are safe and intended.
- The old `src/tasks-worker.js` still works as a fallback; `dueTasks()` skips tasks that
  the work_queue already owns, so they never double-run.
