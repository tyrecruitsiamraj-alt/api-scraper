import { getJobthaiSession } from './session.js';
import { fetchResumeHtml, resumeDetailUrl, revealContact, searchResumeIds } from './client.js';
import { externalId, parseResumeHtml } from './parser.js';
import { collectAssetsForDb } from './assets.js';

const isReal = (v) => v && !/x{3,}|click|กรุณา|ดูข้อมูล/i.test(v);

export const jobthaiProvider = {
  id: 'jobthai',
  label: 'JobThai',

  getSession: getJobthaiSession,
  searchResumeIds,
  fetchResumeHtml,
  resumeDetailUrl,
  parseResumeHtml,
  collectAssetsForDb,
  externalId,

  /**
   * Reveal masked contacts via ajaxCheckViewStatusV2.php (costs view quota).
   * ONE call (type=mobile) returns all contacts as a "####"-delimited blob:
   *   ####<phone>####<email>####<line>####<code>####<code>
   * so we make a single request (not three) and split it.
   */
  async enrichContacts(request, id, record) {
    const blob = await revealContact(request, id, 'mobile');
    if (!blob) return record;
    const segs = blob.split('####').map((s) => s.trim()).filter(isReal);
    const phone = segs.find((s) => /^\+?\d[\d\s-]{7,}$/.test(s));
    const email = segs.find((s) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s));
    // line id: a non-numeric token that isn't phone/email (exclude internal codes like "20.225", "1618")
    const line = segs.find((s) => s !== phone && s !== email && !/^\d+(\.\d+)?$/.test(s) && !/^\+?\d[\d\s-]{7,}$/.test(s));
    if (phone) record.phone = phone.replace(/\D/g, '');
    if (email) record.email = email;
    if (line) record.line_id = line;
    if (record.name && (record.phone || record.email)) record.parse_status = 'success';
    return record;
  },
};
