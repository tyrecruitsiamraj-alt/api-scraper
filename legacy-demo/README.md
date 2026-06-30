# JobBKK Scraping Demo

Terminal-based Node.js + Playwright demo for collecting candidate resume data from JobBKK **Resume Search Talent** using an authorized employer account.

> **Internal demo only.** Use only with accounts and data access you are permitted to use. Do not bypass CAPTCHA, OTP, or access control.

## Scope

- Terminal demo only
- No frontend app, database, Google Sheets, or AI scoring
- **Config-first**: local popup → Start once → fully automated
- Credentials from `.env` (never hardcoded)
- Readable markdown output plus CSV/JSONL

## Requirements

- Node.js 18+
- npm
- Authorized JobBKK employer account

## Install

```bash
cd Desktop/demo-scaping
npm install
npx playwright install chromium
cp .env.example .env
```

Edit `.env` and set your credentials:

```env
JOBBKK_USERNAME=your_username
JOBBKK_PASSWORD=your_password
```

Do **not** commit `.env`.

## Run

```bash
npm run scrape
```

## Workflow (config-first)

1. **Local config popup** opens — fill search criteria (Thai labels)
2. Click **Start** once (or press Enter in terminal as fallback)
3. Config saved to `output/search-criteria.json`
4. Bot opens employer login URL from `.env` (`JOBBKK_EMPLOYER_LOGIN_URL`)
   - If `JOBBKK_HOME_URL` is set → home first, then click employer login
   - If not set → go directly to login URL (matches your `.env`)
5. Logs in with `JOBBKK_USERNAME` / `JOBBKK_PASSWORD` from `.env`
6. If CAPTCHA/OTP appears → pause for manual verification → press Enter
7. Goes to resume search URL from `.env` (`JOBBKK_RESUME_SEARCH_URL`)
8. **`applyJobBkkFilters`** fills filters automatically (no manual input on JobBKK)
9. Filter report saved to `output/filter-apply-report.json`
10. Clicks search → waits for results → collects `data-id` resume links
11. Scrapes up to `maxCandidates` detail pages
12. Exports readable markdown, CSV, JSONL, summary

## Config popup fields

| Field | Description |
|---|---|
| position | ชื่อตำแหน่งงาน |
| keyword | คำค้นเพิ่มเติม |
| maxCandidates | จำนวน resume (1–100, default 15) |
| province | จังหวัด / พื้นที่ |
| salaryMin / salaryMax | เงินเดือน |
| ageMin / ageMax | อายุ |
| gender | ไม่ระบุ / ชาย / หญิง |
| education | วุฒิการศึกษา |
| experience | ประสบการณ์ |
| availableStart | ไม่ระบุ / ทันที / ภายใน 7–30 วัน |
| drivingLicense | ไม่ระบุ / มี / ไม่มี |

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `JOBBKK_HOME_URL` | JobBKK home (optional — if set, click employer login from home) | (empty = go direct to login URL) |
| `JOBBKK_EMPLOYER_LOGIN_URL` | Employer login URL | (required) |
| `JOBBKK_RESUME_SEARCH_URL` | Resume Search Talent URL | (required) |
| `JOBBKK_USERNAME` | Login username | (required) |
| `JOBBKK_PASSWORD` | Login password | (required) |
| `HEADLESS` | Run browser headless | `false` |
| `DEFAULT_MAX_CANDIDATES` | Default in config popup | `15` |
| `PAUSE_AT_END` | Keep browser open until Enter | `true` |
| `DEBUG_MODE` | Verbose logging | `true` |
| `DELAY_MS` | Delay between candidates (ms) | `3000` |

## Filter automation

`applyJobBkkFilters(page, criteria)` in `jobbkk-filters.js`:

- Tries direct selectors per field (logged in `filter-apply-report.json`)
- Falls back to premium-page popover/autocomplete when needed
- Optional fields that cannot be mapped are **skipped**, not fatal
- Fails only if **both** position and keyword were requested but neither could be applied

## Resume link collection

Primary strategy on premium page:

```
article.bg-resume a.read-profile[data-id]
article.bg-resume a.clickShowDetail[data-id]
→ https://www.jobbkk.com/resumes/preview_new/{data-id}
```

## Output files

| File | Description |
|---|---|
| `search-criteria.json` | Config from popup |
| `filter-apply-report.json` | Per-field apply success/skip/error |
| `01-home.png` / `.html` | JobBKK home |
| `02-employer-login.png` / `.html` | Employer login page |
| `03-login-after.png` / `.html` | After login |
| `03-resume-search-talent.png` / `.html` | Premium search page |
| `04-filters-filled.png` / `.html` | After filters applied |
| `05-search-result.png` / `.html` | Search results |
| `result-links.txt` | Collected resume URLs |
| `page-inspection.txt` | Debug inspection (when 0 links) |
| `candidate-NNN.png` / `.html` | Per-candidate captures |
| `candidates-readable.md` | Human-readable report |
| `candidates.csv` | CSV export |
| `candidates.jsonl` | JSONL with full `raw_text` |
| `run_summary.json` | Run metadata and counts |

## Troubleshooting

### Login fails

- Verify credentials in `.env`
- Complete CAPTCHA/OTP manually when prompted
- Check `output/02-employer-login.png` and `output/03-login-after.png`

### No candidate links

```
No candidate data-id links found. Please inspect output/05-search-result.png and output/05-search-result.html
```

Also check `output/page-inspection.txt` and `output/result-links.txt`.

### Filters not applied

- Inspect `output/filter-apply-report.json` for per-field status
- Check `output/04-filters-filled.png`

## Project layout

```
demo-scaping/
├── scrape.js              # Main demo
├── config-popup.js        # Local config popup
├── jobbkk-filters.js      # applyJobBkkFilters + search
├── resume-premium-search.js  # Premium popover helpers
├── package.json
├── .env.example
└── output/                # Run artifacts
```

## Legal / ethical note

Use only with legitimate employer access. Respect JobBKK terms of service, candidate privacy, and applicable data protection rules.
