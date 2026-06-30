import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { attachmentGapMs, waitForResumePageReady } from './scrape-timing.js';

export const ATTACHMENT_URL_PATTERNS = [
  /\/resumes\/download_attach\//i,
  /\/resumes\/download_professional_license/i,
];

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function relOutputPath(...parts) {
  return ['output', ...parts].join('/');
}

export function isAttachmentUrl(url) {
  if (!url) return false;
  return ATTACHMENT_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export function sanitizeFilename(name, fallback = 'file') {
  const base = cleanText(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return base || fallback;
}

/** ASCII-only filename — avoids Windows/PDF viewer issues with Thai paths. */
export function attachmentDiskName(index, title, fileId, ext) {
  let slug = sanitizeFilename(title, 'portfolio')
    .normalize('NFKD')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!slug || slug.length < 2) slug = 'portfolio';
  return `${String(index + 1).padStart(2, '0')}-${slug}-${fileId}${ext}`;
}

async function readPlaywrightDownloadBuffer(download) {
  const failure = await download.failure();
  if (failure) throw new Error(failure);
  const tempPath = await download.path();
  return readFile(tempPath);
}

export function extensionFromUrl(url, contentType = '') {
  const type = String(contentType).replace(/"/g, '').toLowerCase();
  if (type.includes('jpeg')) return '.jpg';
  if (type.includes('png')) return '.png';
  if (type.includes('gif')) return '.gif';
  if (type.includes('webp')) return '.webp';
  if (type.includes('pdf')) return '.pdf';
  if (type.includes('msword')) return '.doc';
  if (type.includes('wordprocessingml')) return '.docx';
  if (type.includes('spreadsheetml')) return '.xlsx';
  if (type.includes('zip')) return '.zip';

  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname);
    if (ext && ext.length <= 6 && !['.php', '.asp', '.aspx', '.jsp'].includes(ext.toLowerCase())) {
      return ext.toLowerCase();
    }
  } catch {
    // ignore
  }
  return '';
}

export function toAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

export function attachmentFileId(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'file';
  } catch {
    return 'file';
  }
}

function parseFilenameFromDisposition(headerValue = '') {
  const value = String(headerValue);
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || '';
}

export function inspectBuffer(buffer) {
  if (!buffer || buffer.length < 32) {
    return { valid: false, kind: 'empty', ext: '.bin', reason: 'empty' };
  }

  const hex = buffer.subarray(0, 12).toString('hex');
  const text = buffer.subarray(0, 400).toString('utf8').toLowerCase();

  if (
    text.includes('<!doctype html') ||
    text.includes('<html') ||
    text.includes('employer_login') ||
    text.includes('กรุณาเข้าสู่ระบบ')
  ) {
    return { valid: false, kind: 'html', ext: '.html', reason: 'html_response' };
  }

  if (hex.startsWith('25504446')) {
    const tail = buffer.subarray(Math.max(0, buffer.length - 4096)).toString('latin1');
    if (!tail.includes('%%EOF') && !tail.includes('startxref')) {
      return { valid: false, kind: 'pdf', ext: '.pdf', reason: 'truncated_pdf' };
    }
    return { valid: true, kind: 'pdf', ext: '.pdf', reason: 'magic' };
  }
  if (hex.startsWith('504b0304')) return { valid: true, kind: 'docx', ext: '.docx', reason: 'magic' };
  if (hex.startsWith('d0cf11e0')) return { valid: true, kind: 'doc', ext: '.doc', reason: 'magic' };
  if (hex.startsWith('ffd8ff')) return { valid: true, kind: 'jpeg', ext: '.jpg', reason: 'magic' };
  if (hex.startsWith('89504e47')) return { valid: true, kind: 'png', ext: '.png', reason: 'magic' };
  if (hex.startsWith('47494638')) return { valid: true, kind: 'gif', ext: '.gif', reason: 'magic' };
  if (hex.startsWith('52494646')) return { valid: true, kind: 'webp', ext: '.webp', reason: 'magic' };

  return { valid: false, kind: 'unknown', ext: '.bin', reason: 'unknown_format' };
}

export function attachmentsSummary(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  return attachments
    .map((item) => {
      const title = item.title || 'attachment';
      const path = item.local_path || item.source_url || '-';
      const status = item.download_status || '-';
      return `${title} | ${path} | ${status}`;
    })
    .join(' || ');
}

function normalizeAttachmentSource(att, index) {
  if (typeof att === 'string') {
    if (att.includes(': http')) {
      const [title, ...rest] = att.split(': ');
      return { title, source_url: rest.join(': ') };
    }
    return { title: `attachment-${index + 1}`, source_url: att };
  }
  return {
    title: att.title || `attachment-${index + 1}`,
    source_url: att.source_url || '',
  };
}

async function clearAttachmentDir(attachDir) {
  const files = await readdir(attachDir).catch(() => []);
  await Promise.all(files.map((file) => unlink(join(attachDir, file)).catch(() => {})));
}

async function findDownloadLink(page, sourceUrl) {
  const absUrl = toAbsoluteUrl(sourceUrl, page.url());
  const fileId = attachmentFileId(absUrl);
  const links = page.locator('a[href*="download_attach"], a[href*="download_professional_license"]');
  const count = await links.count();

  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    const href = (await link.getAttribute('href').catch(() => '')) ?? '';
    const url = toAbsoluteUrl(href, page.url());
    if (!url.includes(fileId)) continue;
    if (!(await link.isVisible().catch(() => false))) continue;

    const disabledButton = link.locator('button[disabled], button.disable-chat');
    if ((await disabledButton.count()) > 0) {
      const enabledButton = link.locator('button:not([disabled]):not(.disable-chat)');
      if ((await enabledButton.count()) === 0) continue;
    }

    return link;
  }

  return null;
}

async function clickDownloadLink(page, link) {
  await link.scrollIntoViewIfNeeded().catch(() => {});
  const button = link.locator('button:not([disabled]):not(.disable-chat)').first();
  if ((await button.count()) > 0 && (await button.isVisible().catch(() => false))) {
    await button.click({ timeout: 15_000 });
    return;
  }
  await link.click({ timeout: 15_000 });
}

async function restoreResumePage(page, resumeUrl) {
  if (!resumeUrl || page.url() === resumeUrl) return;
  await page.goto(resumeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  await sleep(800);
}

async function downloadBufferViaRequest(context, sourceUrl, referer) {
  const absUrl = toAbsoluteUrl(sourceUrl, referer || 'https://www.jobbkk.com/');
  const response = await context.request.get(absUrl, {
    timeout: 90_000,
    headers: {
      Referer: referer || 'https://www.jobbkk.com/',
      Accept: '*/*',
    },
  });

  const buffer = await response.body();
  const contentType = response.headers()['content-type'] ?? '';
  const disposition = response.headers()['content-disposition'] ?? '';
  const inspection = inspectBuffer(buffer);

  if (!response.ok()) {
    throw new Error(`HTTP ${response.status()}`);
  }

  return {
    buffer,
    contentType,
    disposition,
    inspection,
    status: response.status(),
    method: 'request',
  };
}

async function downloadBufferViaClickResponse(page, sourceUrl) {
  const resumeUrl = page.url();
  const absUrl = toAbsoluteUrl(sourceUrl, resumeUrl);
  const fileId = attachmentFileId(absUrl);
  const link = await findDownloadLink(page, sourceUrl);
  if (!link) throw new Error('download_link_not_found');

  const response = await Promise.all([
    page.waitForResponse(
      (res) => {
        const url = res.url();
        return (
          (url.includes('download_attach') || url.includes('download_professional_license')) &&
          url.includes(fileId) &&
          res.request().method() === 'GET' &&
          res.ok()
        );
      },
      { timeout: 90_000 },
    ),
    clickDownloadLink(page, link),
  ]).then(([res]) => res);

  const buffer = await response.body();
  await restoreResumePage(page, resumeUrl);

  return {
    buffer,
    contentType: response.headers()['content-type'] ?? '',
    disposition: response.headers()['content-disposition'] ?? '',
    inspection: inspectBuffer(buffer),
    status: response.status(),
    method: 'click_response',
  };
}

async function downloadBufferViaDownloadEvent(page, sourceUrl) {
  const resumeUrl = page.url();
  const link = await findDownloadLink(page, sourceUrl);
  if (!link) throw new Error('download_link_not_found');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    clickDownloadLink(page, link),
  ]);

  const buffer = await readPlaywrightDownloadBuffer(download);
  await restoreResumePage(page, resumeUrl);

  const suggested = download.suggestedFilename() || '';
  return {
    buffer,
    contentType: '',
    disposition: suggested ? `filename="${suggested}"` : '',
    inspection: inspectBuffer(buffer),
    status: 200,
    method: 'download_event',
    suggestedFilename: suggested,
  };
}

async function downloadBufferViaGoto(context, sourceUrl, referer) {
  const absUrl = toAbsoluteUrl(sourceUrl, referer || 'https://www.jobbkk.com/');
  const page = await context.newPage();
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90_000 }),
      page.goto(absUrl, { waitUntil: 'commit', timeout: 90_000, referer }),
    ]);

    const buffer = await readPlaywrightDownloadBuffer(download);

    return {
      buffer,
      contentType: '',
      disposition: download.suggestedFilename() ? `filename="${download.suggestedFilename()}"` : '',
      inspection: inspectBuffer(buffer),
      status: 200,
      method: 'goto_download',
      suggestedFilename: download.suggestedFilename() || '',
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function resolveAttachmentExtension(result, sourceUrl) {
  if (result.inspection?.valid && result.inspection.ext) {
    return result.inspection.ext;
  }

  const suggested = parseFilenameFromDisposition(result.disposition);
  const suggestedExt = extname(suggested);
  if (suggestedExt) return suggestedExt.toLowerCase();

  if (result.suggestedFilename) {
    const ext = extname(result.suggestedFilename);
    if (ext) return ext.toLowerCase();
  }

  return extensionFromUrl(sourceUrl, result.contentType) || '.bin';
}

async function downloadAttachmentBuffer(context, page, sourceUrl, referer) {
  const attempts = [
    () => downloadBufferViaClickResponse(page, sourceUrl),
    () => downloadBufferViaDownloadEvent(page, sourceUrl),
    () => downloadBufferViaGoto(context, sourceUrl, referer),
    () => downloadBufferViaRequest(context, sourceUrl, referer),
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (!result.buffer || result.buffer.length < 32) {
        throw new Error('empty_buffer');
      }
      if (!result.inspection.valid) {
        throw new Error(result.inspection.reason || 'invalid_file');
      }
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('download_failed');
}

async function saveAttachmentFile({
  result,
  sourceUrl,
  title,
  attachDir,
  index,
  candidateNo,
}) {
  const fileId = attachmentFileId(sourceUrl);
  const ext = resolveAttachmentExtension(result, sourceUrl);
  const fileName = attachmentDiskName(index, title, fileId, ext);
  const destAbs = join(attachDir, fileName);
  await writeFile(destAbs, result.buffer);

  const onDisk = await readFile(destAbs);
  const recheck = inspectBuffer(onDisk);
  if (!recheck.valid) {
    await unlink(destAbs).catch(() => {});
    throw new Error(`saved_file_invalid:${recheck.reason}`);
  }

  return {
    local_path: relOutputPath('candidates', candidateNo, 'attachments', fileName),
    file_type: result.inspection.kind,
    suggestedFilename: result.suggestedFilename || parseFilenameFromDisposition(result.disposition),
    download_method: result.method,
  };
}

async function resolveAttachmentPage(context, page, parsed) {
  if (page && !page.isClosed()) {
    return { page, owned: false };
  }

  if (!parsed.source_url) {
    throw new Error('missing_source_url');
  }

  const newPage = await context.newPage();
  await newPage.goto(parsed.source_url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForResumePageReady(newPage);
  return { page: newPage, owned: true };
}

export async function downloadCandidateAssets(context, parsed, candidateNo, outputDir, page = null) {
  const candidateDir = join(outputDir, 'candidates', candidateNo);
  const attachDir = join(candidateDir, 'attachments');
  await mkdir(attachDir, { recursive: true });

  parsed.profile_image_local = '';
  parsed.profile_image_download_status = parsed.profile_image_url ? 'pending' : 'skipped';

  if (parsed.profile_image_url) {
    try {
      const profileUrl = toAbsoluteUrl(parsed.profile_image_url, parsed.source_url || 'https://www.jobbkk.com/');
      const response = await context.request.get(profileUrl, { timeout: 60_000 });
      if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
      const contentType = response.headers()['content-type'] ?? '';
      const ext = extensionFromUrl(profileUrl, contentType) || '.jpg';
      const destAbs = join(candidateDir, `profile${ext}`);
      await writeFile(destAbs, await response.body());
      parsed.profile_image_local = relOutputPath('candidates', candidateNo, `profile${ext}`);
      parsed.profile_image_download_status = 'success';
      console.log(`  [download] profile -> ${parsed.profile_image_local}`);
    } catch (error) {
      parsed.profile_image_download_status = `error:${error.message}`;
      console.warn(`  [download] profile failed: ${error.message}`);
    }
  }

  const sourceAttachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  const downloaded = [];

  if (sourceAttachments.length === 0) {
    parsed.attachments = downloaded;
    parsed.attachments_count = 0;
    parsed.attachments_summary = '';
    return parsed;
  }

  const { page: workPage, owned } = await resolveAttachmentPage(context, page, parsed);
  await clearAttachmentDir(attachDir);

  try {
    const referer = workPage.url();

    for (let i = 0; i < sourceAttachments.length; i += 1) {
      const { title, source_url: sourceUrl } = normalizeAttachmentSource(sourceAttachments[i], i);
      const item = {
        title,
        source_url: sourceUrl || '',
        local_path: '',
        file_type: '',
        download_status: 'pending',
        download_method: '',
      };

      if (!sourceUrl) {
        item.download_status = 'skipped:no_url';
        downloaded.push(item);
        continue;
      }

      try {
        const result = await downloadAttachmentBuffer(context, workPage, sourceUrl, referer);
        const saved = await saveAttachmentFile({
          result,
          sourceUrl,
          title,
          attachDir,
          index: i,
          candidateNo,
        });
        item.local_path = saved.local_path;
        item.file_type = saved.file_type;
        item.download_method = saved.download_method;
        item.download_status = 'success';
        console.log(`  [download] ${title} -> ${item.local_path} (${saved.download_method})`);
      } catch (error) {
        item.download_status = `error:${error.message}`;
        console.warn(`  [download] ${title} failed: ${error.message}`);
      }

      downloaded.push(item);
      if (i < sourceAttachments.length - 1) await sleep(attachmentGapMs());
    }
  } finally {
    if (owned) await workPage.close().catch(() => {});
  }

  parsed.attachments = downloaded;
  parsed.attachments_count = downloaded.length;
  parsed.attachments_summary = attachmentsSummary(downloaded);
  return parsed;
}

export async function downloadAllCandidates(context, candidates, outputDir, delayMs = 0) {
  const results = [];
  let profileSuccess = 0;
  let attachmentSuccess = 0;
  let attachmentFailed = 0;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const candidateNo = String(candidate.index).padStart(3, '0');
    const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || candidate.name || candidateNo;
    console.log(`\nDownload ${candidateNo}: ${name}`);

    const updated = await downloadCandidateAssets(context, { ...candidate }, candidateNo, outputDir);
    results.push(updated);

    if (updated.profile_image_download_status === 'success') profileSuccess += 1;
    for (const att of updated.attachments || []) {
      if (att.download_status === 'success') attachmentSuccess += 1;
      else if (String(att.download_status).startsWith('error:')) attachmentFailed += 1;
    }

    if (delayMs > 0 && i < candidates.length - 1) {
      await sleep(delayMs);
    }
  }

  return {
    candidates: results,
    summary: {
      total_candidates: candidates.length,
      profile_downloaded: profileSuccess,
      attachments_downloaded: attachmentSuccess,
      attachments_failed: attachmentFailed,
    },
  };
}
