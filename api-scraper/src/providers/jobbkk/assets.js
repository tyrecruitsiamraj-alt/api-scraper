import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fetchAsset } from './client.js';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

/**
 * Download profile image + all attachments and return asset records WITH the
 * raw bytes (for storing as Postgres bytea). Variable attachment counts are
 * handled by looping over whatever the resume has. Used by the DB pipeline.
 *
 * Returns Array<{ kind, title, source_url, file_type, mime, byte_size, sha256, content, download_status }>.
 */
export async function collectAssetsForDb(request, record) {
  const assets = [];

  if (record.profile_image_url) {
    try {
      const url = new URL(record.profile_image_url, 'https://www.jobbkk.com/').href;
      const { buffer, contentType } = await fetchAsset(request, url, record.source_url);
      const insp = inspectBuffer(buffer);
      const ext = (insp.valid ? insp.ext : extFromUrl(url, contentType) || '.jpg').replace('.', '');
      assets.push({
        kind: 'profile', title: 'profile', source_url: url,
        file_type: ext, mime: MIME[insp.kind] || contentType || '', byte_size: buffer.length,
        sha256: sha256(buffer), content: buffer, download_status: 'success',
      });
    } catch (e) {
      assets.push({ kind: 'profile', title: 'profile', source_url: record.profile_image_url, download_status: `error:${e.message}` });
    }
  }

  for (const att of Array.isArray(record.attachments) ? record.attachments : []) {
    try {
      const { buffer, contentType, disposition } = await fetchAsset(request, att.source_url, record.source_url);
      const insp = inspectBuffer(buffer);
      let ext = insp.valid ? insp.ext : extFromUrl(att.source_url, contentType);
      if (!insp.valid && /filename/i.test(disposition)) {
        const m = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
        if (m) ext = extname(decodeURIComponent(m[1])) || ext;
      }
      if (!buffer || buffer.length < 32) throw new Error('empty_buffer');
      assets.push({
        kind: 'attachment', title: att.title || 'attachment', source_url: att.source_url,
        file_type: (ext || '.bin').replace('.', ''), mime: MIME[insp.kind] || contentType || '',
        byte_size: buffer.length, sha256: sha256(buffer), content: buffer,
        download_status: insp.valid ? 'success' : 'saved_unverified',
      });
    } catch (e) {
      assets.push({ kind: 'attachment', title: att.title || 'attachment', source_url: att.source_url, download_status: `error:${e.message}` });
    }
  }

  return assets;
}

function inspectBuffer(buffer) {
  if (!buffer || buffer.length < 32) return { valid: false, ext: '.bin', kind: 'empty' };
  const hex = buffer.subarray(0, 12).toString('hex');
  const head = buffer.subarray(0, 400).toString('utf8').toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html') || head.includes('employer_login')) {
    return { valid: false, ext: '.html', kind: 'html' };
  }
  if (hex.startsWith('25504446')) return { valid: true, ext: '.pdf', kind: 'pdf' };
  if (hex.startsWith('504b0304')) return { valid: true, ext: '.docx', kind: 'docx' };
  if (hex.startsWith('d0cf11e0')) return { valid: true, ext: '.doc', kind: 'doc' };
  if (hex.startsWith('ffd8ff')) return { valid: true, ext: '.jpg', kind: 'jpeg' };
  if (hex.startsWith('89504e47')) return { valid: true, ext: '.png', kind: 'png' };
  if (hex.startsWith('47494638')) return { valid: true, ext: '.gif', kind: 'gif' };
  if (hex.startsWith('52494646')) return { valid: true, ext: '.webp', kind: 'webp' };
  return { valid: false, ext: '.bin', kind: 'unknown' };
}

function sanitize(name) {
  return String(name || 'file')
    .normalize('NFKD')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'file';
}

function extFromUrl(url, contentType) {
  const t = String(contentType).toLowerCase();
  if (t.includes('pdf')) return '.pdf';
  if (t.includes('jpeg')) return '.jpg';
  if (t.includes('png')) return '.png';
  try {
    const e = extname(new URL(url).pathname);
    if (e && e.length <= 6 && !['.php', '.aspx'].includes(e.toLowerCase())) return e.toLowerCase();
  } catch { /* ignore */ }
  return '';
}

/**
 * Download profile image + attachments for one candidate via the session.
 * Mutates `record` with local paths + statuses.
 */
export async function downloadAssets(request, record, candidateNo, outputDir) {
  const candidateDir = join(outputDir, 'candidates', candidateNo);
  const attachDir = join(candidateDir, 'attachments');
  await mkdir(attachDir, { recursive: true });

  // profile image
  record.profile_image_local = '';
  record.profile_image_download_status = record.profile_image_url ? 'pending' : 'skipped';
  if (record.profile_image_url) {
    try {
      const { buffer, contentType } = await fetchAsset(request, new URL(record.profile_image_url, 'https://www.jobbkk.com/').href, record.source_url);
      const ext = extFromUrl(record.profile_image_url, contentType) || '.jpg';
      const dest = join(candidateDir, `profile${ext}`);
      await writeFile(dest, buffer);
      record.profile_image_local = `output/candidates/${candidateNo}/profile${ext}`;
      record.profile_image_download_status = 'success';
    } catch (e) {
      record.profile_image_download_status = `error:${e.message}`;
    }
  }

  // attachments
  const sources = Array.isArray(record.attachments) ? record.attachments : [];
  const done = [];
  for (let i = 0; i < sources.length; i += 1) {
    const att = sources[i];
    const item = { title: att.title, source_url: att.source_url, local_path: '', file_type: '', download_status: 'pending' };
    try {
      const { buffer, contentType, disposition } = await fetchAsset(request, att.source_url, record.source_url);
      let insp = inspectBuffer(buffer);
      let ext = insp.valid ? insp.ext : extFromUrl(att.source_url, contentType);
      if (!insp.valid && /filename/i.test(disposition)) {
        const m = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
        if (m) ext = extname(decodeURIComponent(m[1])) || ext;
      }
      if (!insp.valid && !ext) throw new Error(insp.kind || 'invalid_file');
      const fileName = `${String(i + 1).padStart(2, '0')}-${sanitize(att.title)}-${att.file_id}${ext || '.bin'}`;
      await writeFile(join(attachDir, fileName), buffer);
      item.local_path = `output/candidates/${candidateNo}/attachments/${fileName}`;
      item.file_type = insp.kind;
      item.download_status = insp.valid ? 'success' : 'saved_unverified';
    } catch (e) {
      item.download_status = `error:${e.message}`;
    }
    done.push(item);
  }

  record.attachments = done;
  record.attachments_count = done.length;
  return record;
}
