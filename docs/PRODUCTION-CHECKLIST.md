# Production checklist — Scrape → Content → Auto-post

## 1. Scrape (JobBKK / JobThai)

1. **Canary** — login, search 1 result, open 1 detail and validate parser without
   saving a candidate (`npm run canary`).
2. **Search and detail** — fetch IDs, replay details from index 0 after recovery,
   upsert by source identity, and heartbeat the run.
3. **Extract and enrich** — attachments enter a retry-limited OCR queue; contact
   enrichment never blocks scraping.
4. **Review** — inspect the funnel (`search_ids → detail_attempts → parsed →
   local_rejected → contacts_enriched → saved`) before approving results.

Watch for:

- `scrape_runs.status='running'` with an old heartbeat;
- OCR assets with `extract_attempts >= 3`;
- a failed connector canary;
- filters rejecting most results.

## 2. Content

1. Resolve the actual position from the requisition. A workplace or client name
   must never become the job title.
2. Select only same-family trends. AI estimates are labelled `ai_estimate`;
   they are not search volume.
3. Generate A/B captions and poster direction by job family.
4. Run the deterministic factual gate. Unsupported positions, numbers,
   benefits, urgency and claims are rejected.
5. Bind approval to the normalized caption hash. Editing a caption forces a new
   factual check.
6. For a controlled A/B test, split one account's groups into non-overlapping
   sets, wait at least the configured observation window, and compare score per
   posted group.

Never approve a legacy draft whose `factual_validation` or `content_hash` is
missing. Regenerate it first.

## 3. Auto-post

1. Reserve `day + user + job + group + content fingerprint` before opening the
   composer.
2. Move the ledger through `planned → posting → clicked_unverified`.
3. Report success only after a valid Facebook permalink changes the state to
   `verified`.
4. A duplicate reservation is skipped, not counted as a new post. Missing
   evidence or partial failures fail the queue item so a retry can safely skip
   verified pairs and retry failed pairs.
5. Collect engagement at approximately 2h, 24h and 72h. Measurement waits for
   the observation window and uses leads, comments, reactions and shares per
   posted group.

Run `npm run verify:ledger` inside `autopost/` after a schema or posting change.

## 4. Security and privacy

- Required in production: `AUTOPOST_ACCESS_TOKEN`, `POST_WORKER_TOKEN`, and
  `AUTOPOST_CREDENTIAL_KEY` (or `APP_ENCRYPTION_KEY`).
- `/api/config`, run logs and post evidence require the worker token.
- Passwords and Facebook tokens are AES-256-GCM encrypted at rest.
- Candidate list/detail, assets and PDF access write to `data_access_audit`.
- `npm run privacy:retention` is dry-run by default. Deletion requires both
  `--apply` and `--confirm=DELETE_EXPIRED_PII`.

## 5. Release verification

```bash
npm run migrate
npm run test:content
npm run audit:system
npm run privacy:retention
npm run build --prefix web

npm run test:logic --prefix autopost
npm run verify:ledger --prefix autopost
```

Do not call the system production-verified until there is at least one new
factual-gated content pair, one verified live post ledger row, one completed
2h/24h/72h collection cycle, and an online worker heartbeat.
