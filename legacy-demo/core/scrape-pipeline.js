import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { attachmentsSummary } from '../candidate-assets.js';
import { collectSharedCriteria } from '../config-popup.js';
import { defaultDedupeKey } from './candidate-dedupe.js';
import { buildReadableMarkdown, writeCsv, writeJsonl } from './candidate-export.js';
import { envBool, envInt } from './env.js';
import { normalizePlatformMode, platformLabel, resolvePlatforms } from './platform-resolve.js';
import { resolveProvider } from '../providers/registry.js';
import {
  candidateGapMs,
  envInt as timingEnvInt,
  printPreflightReport,
  runPreflightChecks,
  sleep as timingSleep,
  waitForResumePageReady,
} from '../scrape-timing.js';

function linkCollectionBuffer(maxCandidates) {
  return Math.max(5, Math.ceil(maxCandidates * 0.5));
}

async function waitForEnter(message) {
  console.log(message);
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question('');
  } finally {
    rl.close();
  }
}

/**
 * Run scrape for one platform (login → filter → search → collect → parse).
 */
async function runPlatformScrapePhase({
  context,
  provider,
  criteria,
  workPage,
  outputDir,
  headless,
  debugMode,
  delayMin,
  delayMax,
  defaultMaxCandidates,
}) {
  const platformConfig = provider.loadConfig();
  const dedupe = provider.dedupeKey ?? defaultDedupeKey;
  const runAt = new Date().toISOString();
  const errors = [];
  const candidates = [];
  const seenKeys = new Set();
  let duplicateSkipped = 0;
  let resumeLinks = [];
  let linkMeta = null;
  let totalFoundOnPage = 0;
  let totalAvailableEstimate = null;
  let scrapedFailed = 0;
  let filterReport = null;
  let keepBrowserOpen = false;
  let phaseExitCode = 0;

  await mkdir(outputDir, { recursive: true });

  await writeFile(
    join(outputDir, 'active-platform.json'),
    JSON.stringify(
      {
        platform: provider.id,
        platform_label: provider.label,
        scrape_platform_env: process.env.SCRAPE_PLATFORM ?? 'jobbkk',
        started_at: runAt,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  ACTIVE PLATFORM: ${provider.label.padEnd(25)}║`);
  console.log(`║  id: ${provider.id.padEnd(38)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`Platform: ${provider.label} (${provider.id})`);
  console.log(`  Output: ${outputDir}`);

  const platformCriteria = { ...criteria, platform: provider.id };
  await writeFile(join(outputDir, 'search-criteria.json'), JSON.stringify(platformCriteria, null, 2), 'utf8');

  console.log('');
  console.log(`=== [${provider.label}] เริ่ม Login และค้นหา ===`);
  console.log('');

  const page = workPage ?? (await context.newPage());
  await page.bringToFront();

  await provider.prepareSession(page, platformConfig, debugMode);

  filterReport = await provider.applyFilters(page, platformCriteria, platformConfig);
  if (filterReport) {
    await writeFile(join(outputDir, 'filter-apply-report.json'), JSON.stringify(filterReport, null, 2), 'utf8');
  }

  if (provider.saveDebugPage) {
    await provider.saveDebugPage(
      page,
      join(outputDir, '04-filters-filled.png'),
      join(outputDir, '04-filters-filled.html'),
      debugMode,
    );
  }

  await provider.runSearch(page);

  if (provider.saveDebugPage) {
    await provider.saveDebugPage(
      page,
      join(outputDir, '05-search-result.png'),
      join(outputDir, '05-search-result.html'),
      debugMode,
    );
  }
  if (provider.logStep) await provider.logStep('Search results', page);

  const maxNeeded = platformCriteria.maxCandidates + linkCollectionBuffer(platformCriteria.maxCandidates);
  const collected = await provider.collectResumeLinks(page, debugMode, {
    maxNeeded,
    maxCandidates: platformCriteria.maxCandidates,
    withMeta: true,
  });
  resumeLinks = collected.links ?? collected;
  linkMeta = collected.meta ?? null;
  totalFoundOnPage = resumeLinks.length;
  totalAvailableEstimate = linkMeta?.totalAvailable ?? null;

  if (provider.saveResultLinks) {
    await provider.saveResultLinks(resumeLinks, outputDir);
  }

  console.log(`Links collected: ${totalFoundOnPage} (needed up to ${platformCriteria.maxCandidates})`);
  if (totalAvailableEstimate != null) {
    console.log(`Estimated total on site: ${totalAvailableEstimate}`);
    if (totalAvailableEstimate < platformCriteria.maxCandidates) {
      console.warn(
        `⚠ ผลการค้นหามีแค่ ~${totalAvailableEstimate} รายการ — ไม่พอตามที่ขอ ${platformCriteria.maxCandidates} รายการ (ลองผ่อนเงื่อนไขใน popup)`,
      );
    }
  }
  if (linkMeta?.pagesScanned) {
    console.log(`Pages scanned: ${linkMeta.pagesScanned}`);
  }

  const targetCount = platformCriteria.maxCandidates;

  if (resumeLinks.length === 0) {
    keepBrowserOpen = true;
    phaseExitCode = 1;
    if (provider.inspectPage) await provider.inspectPage(page);
    console.error('');
    console.error('No resume links found on search results page.');
    console.error('Inspect output/05-search-result.png and output/result-links.txt');
    console.error('');
  } else {
    const scrapeStartedAt = Date.now();
    const detailPage = await context.newPage();
    let linkIndex = 0;
    let savedCount = 0;

    try {
      while (savedCount < targetCount && linkIndex < resumeLinks.length) {
        const item = resumeLinks[linkIndex];
        linkIndex += 1;

        try {
          console.log(
            `Scraping [${savedCount + 1}/${targetCount}] (link ${linkIndex}/${resumeLinks.length}): ${item.url}`,
          );
          await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await waitForResumePageReady(detailPage);

          if (debugMode && provider.saveDebugPage) {
            const debugNo = String(linkIndex).padStart(3, '0');
            await provider.saveDebugPage(
              detailPage,
              join(outputDir, `candidate-${debugNo}.png`),
              join(outputDir, `candidate-${debugNo}.html`),
              true,
            );
          }

          const parsed = await provider.parseResumeDetailPage(detailPage, {
            sourceUrl: detailPage.url(),
            focusPosition: platformCriteria.position || '-',
            index: savedCount + 1,
            source: provider.source,
            platform: provider.id,
          });

          const key = dedupe(parsed);
          if (seenKeys.has(key)) {
            console.log(`Skipping duplicate (key: ${key}).`);
            duplicateSkipped += 1;
            continue;
          }

          seenKeys.add(key);
          const candidateNo = String(savedCount + 1).padStart(3, '0');
          await provider.downloadAssets(context, parsed, candidateNo, outputDir, detailPage);
          candidates.push(parsed);
          savedCount += 1;
          if (provider.logCandidateSummary) {
            provider.logCandidateSummary(candidateNo, parsed, detailPage);
          }
        } catch (error) {
          scrapedFailed += 1;
          console.error(`Link ${linkIndex}: ${error.message}`);
          errors.push({ candidate: String(linkIndex), url: item.url, error: error.message });
        }

        if (savedCount < targetCount && linkIndex < resumeLinks.length) {
          const gap = candidateGapMs();
          console.log(`  pause ${gap}ms before next candidate`);
          await timingSleep(gap);
        }
      }
    } finally {
      await detailPage.close().catch(() => {});
    }

    const scrapeSec = Math.round((Date.now() - scrapeStartedAt) / 1000);
    console.log(
      `Candidate scrape phase: ${scrapeSec}s | saved ${savedCount}/${targetCount} | links tried ${linkIndex}`,
    );

    if (savedCount < targetCount) {
      phaseExitCode = 1;
      const siteNote =
        totalAvailableEstimate != null && totalAvailableEstimate < targetCount
          ? ` (เว็บมีผลลัพธ์ ~${totalAvailableEstimate} รายการเท่านั้น)`
          : '';
      console.warn(
        `ได้แค่ ${savedCount}/${targetCount} resume${siteNote} — duplicates skipped: ${duplicateSkipped}, links collected: ${resumeLinks.length}`,
      );
    }
  }

  const summary = {
    run_at: runAt,
    platform: provider.id,
    platform_label: provider.label,
    position: platformCriteria.position ?? null,
    keyword: platformCriteria.keyword ?? null,
    search_criteria: platformCriteria,
    filter_apply_report: filterReport,
    requested_candidates: platformCriteria.maxCandidates ?? defaultMaxCandidates,
    total_found_on_page: totalFoundOnPage,
    total_available_estimate: totalAvailableEstimate,
    link_collection_meta: linkMeta,
    scraped_success: candidates.length,
    scraped_failed: scrapedFailed,
    duplicate_skipped: duplicateSkipped,
    errors,
  };

  const formatEducation = provider.formatEducationMarkdown ?? (() => ['-']);
  const formatExperience = provider.formatWorkExperienceMarkdown ?? (() => ['-']);

  await writeFile(
    join(outputDir, 'candidates-readable.md'),
    buildReadableMarkdown({
      platformLabel: provider.label,
      runAt,
      position: platformCriteria.position ?? '-',
      keyword: platformCriteria.keyword ?? '-',
      requestedCandidates: platformCriteria.maxCandidates ?? defaultMaxCandidates,
      totalFoundOnPage,
      scrapedSuccess: candidates.length,
      scrapedFailed,
      candidates,
      formatEducationMarkdown: formatEducation,
      formatWorkExperienceMarkdown: formatExperience,
    }),
    'utf8',
  );
  await writeCsv(join(outputDir, 'candidates.csv'), candidates, { attachmentsSummary });
  await writeJsonl(join(outputDir, 'candidates.jsonl'), candidates);
  await writeFile(join(outputDir, 'run_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('');
  if (resumeLinks.length === 0) {
    console.log(`[${provider.label}] finished with 0 resume links.`);
  } else {
    console.log(`[${provider.label}] complete.`);
    console.log(
      `Requested: ${platformCriteria.maxCandidates} | Collected links: ${totalFoundOnPage} | Scraped: ${candidates.length}`,
    );
    console.log(`Failed: ${scrapedFailed} | Duplicates skipped: ${duplicateSkipped}`);
  }
  console.log(`Output: ${outputDir}`);

  return {
    platform: provider.id,
    platformLabel: provider.label,
    outputDir,
    candidates,
    keepBrowserOpen,
    exitCode: phaseExitCode,
    summary: {
      requested: platformCriteria.maxCandidates ?? 0,
      found: totalFoundOnPage,
      totalAvailableEstimate,
      scraped: candidates.length,
      failed: scrapedFailed,
      duplicateSkipped,
    },
  };
}

/**
 * Unified talent scrape pipeline — supports JobBKK, JobThai, or both.
 */
export async function runTalentScrape(options = {}) {
  const envPlatform = normalizePlatformMode(options.platform ?? process.env.SCRAPE_PLATFORM ?? 'jobbkk');
  const baseOutputDir = options.outputDir ?? join(process.cwd(), 'output');
  const headless = options.headless ?? envBool('HEADLESS', false);
  const debugMode = options.debugMode ?? envBool('DEBUG_MODE', false);
  const pauseAtEnd = options.pauseAtEnd ?? envBool('PAUSE_AT_END', false);
  const defaultMaxCandidates = options.defaultMaxCandidates ?? envInt('DEFAULT_MAX_CANDIDATES', 15);
  const delayMin = timingEnvInt('DELAY_MS_MIN', timingEnvInt('DELAY_MS', 1500));
  const delayMax = timingEnvInt('DELAY_MS_MAX', Math.max(delayMin, delayMin + 800));

  const initialPlatforms = resolvePlatforms(envPlatform, envPlatform);
  const preflightWarnings = [];
  const preflightErrors = [];

  for (const platformId of initialPlatforms) {
    const provider = resolveProvider(platformId);
    const platformConfig = provider.loadConfig();
    const providerPreflight = provider.preflight(platformConfig) ?? { warnings: [], errors: [] };
    preflightWarnings.push(...providerPreflight.warnings);
    preflightErrors.push(...providerPreflight.errors);
  }

  const timingReport = runPreflightChecks({
    username: process.env.JOBBKK_USERNAME || process.env.JOBTHAI_USERNAME,
    password: process.env.JOBBKK_PASSWORD || process.env.JOBTHAI_PASSWORD,
    employerLoginUrl: process.env.JOBBKK_EMPLOYER_LOGIN_URL || process.env.JOBTHAI_LOGIN_URL,
    resumeSearchUrl: process.env.JOBBKK_RESUME_SEARCH_URL || process.env.JOBTHAI_RESUME_SEARCH_URL,
    debugMode,
    delayMin,
    delayMax,
  });

  printPreflightReport({
    warnings: [...preflightWarnings, ...timingReport.warnings],
    errors: [...preflightErrors, ...timingReport.errors],
  });

  if (preflightErrors.length > 0) {
    throw new Error('Preflight failed — แก้ .env ก่อนรัน');
  }

  await mkdir(baseOutputDir, { recursive: true });

  console.log('');
  console.log(`  Timing: candidate gap ${delayMin}–${delayMax}ms (random jitter)`);
  console.log(`  DEBUG_MODE: ${debugMode}`);
  console.log(`  Output base: ${baseOutputDir}`);

  let criteria = options.predefinedCriteria ?? null;
  let workPage = options.predefinedWorkPage ?? null;
  let platforms = options.platforms ?? initialPlatforms;
  let platformMode = options.platformMode ?? envPlatform;

  console.log('Launching Chromium...');
  const browser = await chromium.launch({
    headless,
    args: headless ? [] : ['--start-maximized'],
  });
  const context = await browser.newContext({
    locale: 'th-TH',
    viewport: headless ? { width: 1400, height: 900 } : null,
    acceptDownloads: true,
  });

  const phaseResults = [];
  let keepBrowserOpen = false;
  let hadError = false;

  try {
    if (!criteria) {
      const shared = await collectSharedCriteria(context, defaultMaxCandidates, envPlatform);
      criteria = shared.criteria;
      workPage = shared.workPage;
      platforms = shared.platforms;
      platformMode = shared.platformMode;
      console.log(`Platforms selected: ${platforms.map(platformLabel).join(' → ')}`);
      console.log('Search criteria accepted:', criteria);
    }

    await writeFile(
      join(baseOutputDir, 'active-platform.json'),
      JSON.stringify(
        {
          platform_mode: platformMode,
          platforms,
          platform_labels: platforms.map(platformLabel),
          scrape_platform_env: process.env.SCRAPE_PLATFORM ?? 'jobbkk',
          started_at: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );

    for (let i = 0; i < platforms.length; i += 1) {
      const platformId = platforms[i];
      const provider = resolveProvider(platformId);
      const outputDir = platforms.length === 1 ? baseOutputDir : join(baseOutputDir, platformId);

      if (platforms.length > 1) {
        console.log('');
        console.log(`━━━━━━━━━━ Platform ${i + 1}/${platforms.length}: ${provider.label} ━━━━━━━━━━`);
      }

      try {
        const result = await runPlatformScrapePhase({
          context,
          provider,
          criteria,
          workPage: i === 0 ? workPage : null,
          outputDir,
          headless,
          debugMode,
          delayMin,
          delayMax,
          defaultMaxCandidates,
        });
        phaseResults.push(result);
        if (result.keepBrowserOpen) keepBrowserOpen = true;
        if (result.exitCode) {
          hadError = true;
          process.exitCode = 1;
        }
      } catch (error) {
        hadError = true;
        process.exitCode = 1;
        keepBrowserOpen = debugMode;
        console.error(`\n[${provider.label}] Scrape error:`, error.message);
        if (debugMode) {
          console.error('DEBUG_MODE=true — browser จะไม่ปิดทันที กด Enter ใน terminal เพื่อปิด');
        }
        phaseResults.push({
          platform: platformId,
          platformLabel: provider.label,
          error: error.message,
          exitCode: 1,
        });
      }
    }
  } catch (error) {
    hadError = true;
    process.exitCode = 1;
    keepBrowserOpen = debugMode;
    console.error('\nScrape error:', error.message);
    if (debugMode) {
      console.error('DEBUG_MODE=true — browser จะไม่ปิดทันที กด Enter ใน terminal เพื่อปิด');
    }
  } finally {
    if (pauseAtEnd || keepBrowserOpen) {
      await waitForEnter('\nกด Enter ใน terminal เพื่อปิด browser...');
    }
    await browser.close();
  }

  console.log('');
  if (phaseResults.length > 1) {
    console.log('=== Multi-platform summary ===');
    for (const r of phaseResults) {
      if (r.error) {
        console.log(`  ${r.platformLabel}: ERROR — ${r.error}`);
      } else {
        console.log(
          `  ${r.platformLabel}: ${r.summary.scraped}/${r.summary.requested} scraped (links: ${r.summary.found})`,
        );
      }
    }
  }

  if (!hadError && phaseResults.every((r) => r.summary?.scraped > 0)) {
    console.log('Scrape complete.');
  }

  return {
    platformMode,
    platforms: phaseResults,
    candidates: phaseResults.flatMap((r) => r.candidates ?? []),
  };
}
