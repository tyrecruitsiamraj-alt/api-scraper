# api-scraper — Hybrid talent scraper (Docker + PostgreSQL)

Multi-platform candidate scraper. Logs in once with a headless browser, then
scrapes entirely over direct HTTP (reusing the session) and writes deduplicated
candidates — with photos and attachments — into a central PostgreSQL store.
JobBKK is implemented; JobThai is reverse-engineered and ready to add.

> Fully automated (Human = 0): no popup, no manual CAPTCHA. Credentials live in
> connectors (encrypted in the DB). Designed to run as a Docker container on a
> fixed-IP host (NOT Vercel — datacenter IPs get banned).

## Architecture

```
connectors (DB, encrypted creds)         ┌─────────────────────────────┐
        │                                 │ PostgreSQL "so-candidate-data"
   worker / API                           │  connectors                  │
        │                                 │  scrape_runs                 │
   pipeline.run(connector)                │  candidates  (deduped)       │
        ├─ provider.getSession  (browser login, reused)                  │
        ├─ search (POST) + paginate (GET)  → server HTML                 │
        ├─ detail (GET) → cheerio parse                                  │
        ├─ assets → bytea + sha256         │  candidate_sources (tags)   │
        └─ upsert candidate + source tag + assets ───────────────────────┘
                                           │  candidate_assets (bytea)   │
                                           └─────────────────────────────┘
```

- **Dedupe**: matches phone → email → name; existing candidate is **updated**,
  not duplicated. Every place a candidate is found becomes a row in
  `candidate_sources` (the "tag": platform + connector + external id + url).
- **Connectors**: one platform can have many (e.g. several JobBKK accounts),
  each with its own credentials, per-round `scrape_limit`, and `daily_cap`.
- **Anti-ban**: randomized delays, exponential backoff, soft-ban detection →
  cooldown, session reuse, per-round + daily caps, fixed-IP host.

## Run (local)

```bash
cd api-scraper
npm install
npx playwright install chromium       # first time only
cp .env.example .env                  # set PGPASSWORD + APP_ENCRYPTION_KEY
npm run migrate                       # create schema
npm run connector add -- --platform jobbkk --label "JobBKK-HR1" \
     --username USER --password PASS --limit 15 --daily 200
npm run worker                        # scrape all enabled connectors → DB
npm run api                           # control API (default PORT=8137)
```

## Run (Docker)

```bash
docker compose run --rm migrate       # one-time schema
docker compose run --rm worker        # scrape once (cron this on the host)
docker compose up -d api              # control API on host :8137
```

## Control API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/connectors` | list connectors |
| GET | `/candidates?limit=&platform=` | recent candidates |
| GET | `/candidates/:id` | candidate + sources + asset metadata |
| GET | `/assets/:id` | raw file (image/pdf) from bytea |
| POST | `/runs` `{connectorId, criteria?}` | trigger a scrape (async) |

## .env

See `.env.example`. Key vars: `PGHOST/PGUSER/PGPASSWORD/PGDATABASE`,
`DB_SCHEMA=so-candidate-data`, `APP_ENCRYPTION_KEY` (AES key for connector
passwords — never change after connectors exist), search criteria
(`POSITION`, `KEYWORD`, `MAX_CANDIDATES`, `PROVINCE`, …), and
`REQUEST_DELAY_MIN_MS/MAX_MS` (anti-ban pacing).

## Layout

```
src/
├── config.js                  # env, criteria, runtime
├── db/                        # schema.sql, pool, crypto (AES), migrate, repositories
├── connectors/registry.js     # platform → provider
├── core/                      # anti-ban (rate-limit/backoff/soft-ban), popup dismissal
├── providers/jobbkk/          # session, client, parser (cheerio), assets, provinces.json
├── pipeline.js                # run(connector) → DB
├── worker.js                  # run all enabled connectors
├── api/server.js              # control API
├── cli/connector.js           # manage connectors
└── scrape.js                  # legacy standalone (file output, no DB)
```

## Platforms

Both **JobBKK** and **JobThai** are implemented (`src/providers/<id>/`). To add
another, mirror the same file shape (`session/client/parser/assets/index.js`)
and register it in `connectors/registry.js`. A provider may add an optional
`enrichContacts(request, id, record)` hook (used by JobThai) — the pipeline
calls it after parse for platforms whose contacts aren't in the HTML.

### JobThai specifics
- Login is OAuth (`auth.jobthai.com`); search/list/detail are server HTML.
- Contacts are **masked in the HTML** and revealed via one call
  `GET /common/ajaxCheckViewStatusV2.php?resumecode={id}&type=mobile` which
  returns all contacts `####`-delimited (`####phone####email####line####…`).
- ⚠️ **View quota**: JobThai serves a resume's full detail **only on the first
  view** — re-viewing returns a stripped page and likely consumes the account's
  resume-view quota. So: scrape each resume once, and the pipeline stores the
  full first-view text in `candidate_sources.raw_text` for offline re-parsing.
- Education extraction may include training/certificate entries (over-captures
  rather than misses).

## Notes / ethics

Use only with authorized employer accounts. Candidate data is personal data —
respect platform ToS and PDPA. Connector passwords are encrypted at rest.
```
