import { createHash } from 'node:crypto';
import { BASE, fetchAsset } from './client.js';
import { externalId } from './parser.js';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

function imageExt(buffer, contentType) {
  const hex = buffer.subarray(0, 4).toString('hex');
  if (hex.startsWith('ffd8ff')) return { ext: 'jpg', mime: 'image/jpeg' };
  if (hex.startsWith('89504e47')) return { ext: 'png', mime: 'image/png' };
  if (hex.startsWith('47494638')) return { ext: 'gif', mime: 'image/gif' };
  if (/png/i.test(contentType)) return { ext: 'png', mime: 'image/png' };
  return { ext: 'jpg', mime: 'image/jpeg' };
}

/**
 * JobThai profile image via resume_image.php (no separate attachments on this
 * platform's resume view — profile photo only). Returns bytea asset records.
 */
export async function collectAssetsForDb(request, record) {
  const id = externalId(record.source_url);
  if (!id) return [];
  const gender = /หญิง/.test(record.gender || '') ? 'f' : 'm';
  const url = `${BASE}/service/resume_image.php?code=${id}&gender=${gender}&size=normal&unlock=1`;
  try {
    const { buffer, contentType } = await fetchAsset(request, url, record.source_url);
    if (!buffer || buffer.length < 64) return []; // empty/placeholder
    const { ext, mime } = imageExt(buffer, contentType);
    return [{
      kind: 'profile', title: 'profile', source_url: url,
      file_type: ext, mime, byte_size: buffer.length, sha256: sha256(buffer),
      content: buffer, download_status: 'success',
    }];
  } catch (e) {
    return [{ kind: 'profile', title: 'profile', source_url: url, download_status: `error:${e.message}` }];
  }
}
