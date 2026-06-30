import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSharedCriteria } from '../../config-popup.js';
import { downloadCandidateAssets } from '../../candidate-assets.js';
import { defaultDedupeKey, resumeIdFromUrl } from '../../core/candidate-dedupe.js';
import { envBool, envString, sleep } from '../../core/env.js';
import {
  applyJobThaiFilters,
  clickJobThaiSearchButton,
  waitForJobThaiSearchResults,
} from './jobthai-filters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const OUTPUT_DIR = join(__dirname, '..', '..', 'output');

function cleanText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function emptyResumeRecord() {
  return {
    prefix: '',
    name: '',
    first_name: '',
    last_name: '',
    profile_image_url: '',
    profile_image_local: '',
    profile_image_download_status: 'pending',
    phone: '',
    email: '',
    line_id: '',
    facebook: '',
    address: '',
    intro: '',
    desired_positions: '',
    desired_work_area: '',
    job_type: '',
    expected_salary: '',
    available_start: '',
    education: [],
    work_experience: [],
    education_summary: '',
    experience_summary: '',
    gender: '',
    age: '',
    birth_date: '',
    nationality: '',
    religion: '',
    height: '',
    weight: '',
    marital_status: '',
    military_status: '',
    vehicle: '',
    driving_license: '',
    driving_ability: '',
    hard_skills: [],
    soft_skills: [],
    language_skills: [],
    typing_skills: '',
    attachments: [],
    province: '',
    raw_text: '',
  };
}

export function jobthaiResumeIdFromUrl(url) {
  return resumeIdFromUrl(url);
}

export function jobthaiDedupeKey(candidate) {
  const id = jobthaiResumeIdFromUrl(candidate.source_url);
  if (id) return `jobthai:resume:${id}`;
  return defaultDedupeKey(candidate);
}

function getParseStatus(record, rawText) {
  if (!rawText) return 'failed';
  const hasContact = cleanText(record.phone) || cleanText(record.email);
  if (cleanText(record.name) && hasContact) return 'success';
  return 'partial';
}

const THAI_NAME_PREFIXES = [
  'นางสาว',
  'Mr.',
  'Mrs.',
  'Miss',
  'Ms.',
  'Dr.',
  'ดร.',
  'น.ส.',
  'น.ส',
  'ด.ช.',
  'ด.ญ.',
  'ดช.',
  'ดญ.',
  'นาย',
  'นาง',
];

function splitThaiFullName(fullName) {
  let parts = cleanText(fullName).split(/\s+/).filter(Boolean);
  let prefix = '';

  if (parts.length > 0) {
    const sortedPrefixes = [...THAI_NAME_PREFIXES].sort((a, b) => b.length - a.length);
    for (const candidate of sortedPrefixes) {
      if (parts[0] === candidate || parts[0].startsWith(candidate)) {
        prefix = parts.shift();
        break;
      }
    }
  }

  const first_name = parts[0] ?? '';
  const last_name = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const name = [prefix, first_name, last_name].filter(Boolean).join(' ');

  return { prefix, first_name, last_name, name };
}

function summarizeEducation(education) {
  if (!Array.isArray(education) || education.length === 0) return '';
  return education
    .map((item) => {
      const parts = [
        item.institution,
        item.graduation_year ? `ปีที่จบ ${item.graduation_year}` : '',
        item.degree,
        item.faculty,
        item.major,
        item.gpa ? `เกรด ${item.gpa}` : '',
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .join(' || ');
}

function summarizeExperience(workExperience) {
  if (!Array.isArray(workExperience) || workExperience.length === 0) return '';
  return workExperience
    .map((item) => {
      const parts = [item.period || item.year, item.position, item.company].filter(Boolean);
      return parts.join(' @ ');
    })
    .join(' || ');
}

export function formatEducationMarkdown(education) {
  if (!Array.isArray(education) || education.length === 0) return ['-'];
  return education.flatMap((item) => {
    const lines = [`* ${item.institution || '-'}`];
    if (item.graduation_year) lines.push(`  - ปีที่จบ: ${item.graduation_year}`);
    if (item.degree) lines.push(`  - วุฒิ: ${item.degree}`);
    if (item.faculty) lines.push(`  - คณะ: ${item.faculty}`);
    if (item.major) lines.push(`  - สาขา: ${item.major}`);
    if (item.gpa) lines.push(`  - เกรด: ${item.gpa}`);
    return lines;
  });
}

export function formatWorkExperienceMarkdown(workExperience) {
  if (!Array.isArray(workExperience) || workExperience.length === 0) return ['-'];
  return workExperience.flatMap((item, index) => {
    const title = item.position && item.company
      ? `#### ${index + 1}) ${item.position} — ${item.company}`
      : `#### ${index + 1}) ${item.position || item.company || '-'}`;
    const lines = [title];
    if (item.year || item.period) lines.push(`* ปี/ช่วงเวลา: ${item.period || item.year}`);
    if (item.salary) lines.push(`* เงินเดือน: ${item.salary}`);
    if (item.responsibilities) {
      lines.push('* รายละเอียด:');
      for (const line of String(item.responsibilities).split(/\n+/).map(cleanText).filter(Boolean)) {
        lines.push(`  - ${line}`);
      }
    }
    lines.push('');
    return lines;
  });
}

async function extractJobThaiStructuredData(page) {
  return page.evaluate(() => {
    const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

    const readFieldInTable = (table, label) => {
      const topics = [...table.querySelectorAll('span.headTopic.lightblack')];
      for (const topic of topics) {
        const text = norm(topic.textContent);
        if (!text.startsWith(label)) continue;
        const row = topic.closest('tr');
        const valueEl = row?.querySelector('td:last-child span.headNormal.fontBlack, td:last-child span.head1.black');
        return norm(valueEl?.textContent);
      }
      return '';
    };

    const findSectionRoot = (headingText) => {
      const headings = [...document.querySelectorAll('span.headBI.fontWhite')];
      for (const heading of headings) {
        if (!norm(heading.textContent).includes(headingText)) continue;
        const headerRow = heading.closest('tr');
        const sectionTable = headerRow?.closest('table');
        return sectionTable?.closest('td') || sectionTable;
      }
      return null;
    };

    const readInstitution = (table) => {
      const candidates = [...table.querySelectorAll('tr td[colspan="2"] span.headNormal.fontBlack')]
        .map((el) => norm(el.textContent))
        .filter(Boolean);
      return (
        candidates.find((t) => /มหาวิทยาลัย|วิทยาลัย|โรงเรียน|สถาบัน/i.test(t)) ||
        candidates.find((t) => !/\d{5}/.test(t) && !/^\d{4}$/.test(t)) ||
        ''
      );
    };

    let first_name = '';
    let last_name = '';
    let address = '';
    const detail = document.querySelector('#detailshow');
    if (detail) {
      const detailText = detail.innerText || '';
      const nameMatch = detailText.match(/ชื่อ\s+([^\n]+?)\s+นามสกุล\s+([^\n]+)/u);
      if (nameMatch) {
        first_name = norm(nameMatch[1]);
        last_name = norm(nameMatch[2]);
      } else {
        const names = [...detail.querySelectorAll('span.head1.black')]
          .map((el) => norm(el.textContent))
          .filter(Boolean);
        first_name = names[0] || '';
        last_name = names[1] || '';
      }

      const addressMatch = detailText.match(/ที่อยู่\s+([^\n]+)(?:\n([^\n]+))?/u);
      if (addressMatch) {
        address = norm([addressMatch[1], addressMatch[2]].filter(Boolean).join(' '));
      }
    }

    const personal = {
      gender: '',
      birth_date: '',
      age: '',
      nationality: '',
      religion: '',
      marital_status: '',
      height: '',
      weight: '',
    };
    const personalRoot = findSectionRoot('รายละเอียดส่วนตัว') || document.body;
    const personalTable = personalRoot.querySelector?.('table') || null;
    if (personalTable) {
      for (const key of Object.keys(personal)) {
        const labelMap = {
          gender: 'เพศ',
          birth_date: 'วันเกิด',
          age: 'อายุ',
          nationality: 'สัญชาติ',
          religion: 'ศาสนา',
          marital_status: 'สถานภาพสมรส',
          height: 'ส่วนสูง',
          weight: 'น้ำหนัก',
        };
        personal[key] = readFieldInTable(personalTable, labelMap[key]);
      }
    }

    let desired_positions = '';
    let expected_salary = '';
    let desired_work_area = '';
    let job_type = '';
    let available_start = '';
    const jobRoot = findSectionRoot('ลักษณะงานที่ต้องการ');
    const jobTable = jobRoot?.querySelector?.('table') || null;
    if (jobTable) {
      const positionText = readFieldInTable(jobTable, 'ตำแหน่งงานที่ต้องการสมัคร');
      desired_positions = positionText
        .split(/\d+\./)
        .map((part) => norm(part))
        .filter(Boolean)
        .join(' | ');
      expected_salary = readFieldInTable(jobTable, 'เงินเดือนที่ต้องการ');
      desired_work_area = readFieldInTable(jobTable, 'สถานที่ที่ต้องการทำงาน');
      job_type = readFieldInTable(jobTable, 'ประเภทงานที่ต้องการ');
      available_start = readFieldInTable(jobTable, 'วันที่สามารถเริ่มงานได้');
    }

    const education = [];
    const eduRoot = findSectionRoot('ประวัติการศึกษา');
    const seenEdu = new Set();
    if (eduRoot) {
      const eduTables = [...eduRoot.querySelectorAll('table')].filter((table) =>
        table.querySelector('span.headTopic.lightblack'),
      );
      for (const table of eduTables) {
        if (!readFieldInTable(table, 'ระดับการศึกษา') && !readFieldInTable(table, 'สาขา')) continue;
        const yearEl = table.querySelector('div[style*="float:right"] span.headNormal.fontBlack');
        const institution = readInstitution(table);
        if (!institution) continue;
        const item = {
          graduation_year: norm(yearEl?.textContent),
          institution,
          degree: readFieldInTable(table, 'ระดับการศึกษา') || readFieldInTable(table, 'วุฒิ'),
          major: readFieldInTable(table, 'สาขา'),
          faculty: readFieldInTable(table, 'คณะ'),
          gpa: readFieldInTable(table, 'เกรดเฉลี่ย'),
        };
        const key = `${item.institution}|${item.degree}|${item.major}|${item.graduation_year}`;
        if (seenEdu.has(key)) continue;
        seenEdu.add(key);
        education.push(item);
      }
    }

    const work_experience = [];
    const workRoot = findSectionRoot('ประวัติการทำงาน');
    const seenWork = new Set();
    if (workRoot) {
      const workTables = [...workRoot.querySelectorAll('table')].filter((table) => table.querySelector('span.head2.blue'));
      for (const table of workTables) {
        const periodEl = table.querySelector('div[style*="float:right"]');
        const period = norm(periodEl?.textContent).replace(/\s+/g, ' ');
        const company = norm(table.querySelector('span.head2.blue')?.textContent);
        const position = readFieldInTable(table, 'ตำแหน่ง');
        if (!company && !position) continue;
        const salary = readFieldInTable(table, 'เงินเดือน');
        let responsibilities = '';
        const respTopic = [...table.querySelectorAll('span.headTopic.lightblack')].find((el) =>
          norm(el.textContent).includes('หน้าที่รับผิดชอบ'),
        );
        if (respTopic) {
          const respBlock = respTopic.closest('tr')?.querySelector('span.headNormal.fontBlack');
          responsibilities = norm(respBlock?.innerHTML?.replace(/<br\s*\/?>/gi, '\n') || respBlock?.textContent);
        }
        const yearMatch = period.match(/(\d{4})\s*$/);
        const item = {
          company,
          position,
          period,
          year: yearMatch?.[1] || '',
          salary,
          responsibilities,
        };
        const key = `${item.company}|${item.position}|${item.period}`;
        if (seenWork.has(key)) continue;
        seenWork.add(key);
        work_experience.push(item);
      }
    }

    let province = '';
    const provinceMatch = address.match(/(กรุงเทพมหานคร|(?:จังหวัด)?[ก-๙]+)\s*\d{5}/u);
    if (provinceMatch?.[1]) {
      province = norm(provinceMatch[1].replace(/^จังหวัด/, ''));
    }

    return {
      first_name,
      last_name,
      address,
      province,
      ...personal,
      desired_positions,
      expected_salary,
      desired_work_area,
      job_type,
      available_start,
      education,
      work_experience,
    };
  });
}

function isMaskedContact(value) {
  const v = cleanText(value);
  return !v || /click\s*ดูข้อมูล/i.test(v) || /x{3,}/i.test(v);
}


function extractPhoneFromText(text) {
  const match = String(text).match(/(?:Mobile|Tel|โทร|เบอร์)[^\d]*(\d[\d\s-]{8,14}\d)/i);
  return cleanText(match?.[1]).replace(/\s+/g, '');
}

function extractEmailFromText(text) {
  const match = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return cleanText(match?.[0]);
}

async function waitForJobThaiLoginComplete(page, timeoutMs = 120_000) {
  const start = Date.now();
  let notifiedCaptcha = false;

  while (Date.now() - start < timeoutMs) {
    if (await isJobThaiEmployerLoggedIn(page)) {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(1500);
      console.log(`JobThai login complete — ${page.url()}`);
      return true;
    }

    const hasCaptcha = (await page.locator('iframe[src*="recaptcha"], iframe[src*="captcha"]').count()) > 0;
    if (hasCaptcha && !notifiedCaptcha) {
      console.log('Captcha detected — complete it in the browser; scraper will continue when login succeeds.');
      notifiedCaptcha = true;
    }

    await sleep(500);
  }

  throw new Error('JobThai login timed out — employer session not detected within 2 minutes');
}

async function isJobThaiEmployerLoggedIn(page) {
  const url = page.url();
  if (/auth\.jobthai\.com/i.test(url)) return false;

  const loginFormVisible = await page
    .locator('#login-form-username, #login_company')
    .first()
    .isVisible()
    .catch(() => false);
  if (loginFormVisible) return false;

  if (/findresume|postjob|www3\.jobthai/i.test(url)) {
    const employerMenu = page.locator('#company-search-resume, :text("ออกจากระบบ"), :text("ค้นประวัติ")');
    return (await employerMenu.count()) > 0;
  }

  return false;
}

async function markJobThaiTab(page, label) {
  await page.evaluate((platformLabel) => {
    if (!document.title.startsWith(`[${platformLabel}]`)) {
      document.title = `[${platformLabel}] ${document.title}`;
    }
  }, label);
}

async function revealJobThaiContacts(page) {
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));

  try {
    const clicked = await page.evaluate(() => {
      if (typeof showPhone === 'function') {
        showPhone('click_contact_normal_text');
        return 'showPhone';
      }
      const link = document.querySelector('a[href*="showPhone"]');
      if (link) {
        link.click();
        return 'link';
      }
      return '';
    });

    if (!clicked) {
      await page.locator('a[href*="showPhone"], a:has-text("Click ดูข้อมูล")').first().click({ timeout: 5000 }).catch(() => {});
    }
  } catch {
    // ignore — analytics helpers may be missing on saved HTML
  }

  await sleep(1500);
}

async function readContactFields(page) {
  return page.evaluate(() => {
    const read = (id) => document.getElementById(id)?.innerText?.replace(/\s+/g, ' ').trim() || '';
    const readFirst = (ids) => {
      for (const id of ids) {
        const value = read(id);
        if (value) return value;
      }
      return '';
    };
    const email =
      readFirst(['link_drectemailto_1', 'link_drectemailto_2', 'link_drectemailto_3']) ||
      document.getElementById('real_email_resume')?.value ||
      readFirst(['hiddenMail_1', 'hiddenMail_2', 'hiddenMail_3']);
    return {
      phone: readFirst(['hiddenPhone_1', 'hiddenPhone_2', 'hiddenPhone_3', 'hiddenTel_1']),
      email,
      line_id: readFirst(['hiddenLineID_1', 'hiddenLineID_2', 'hiddenLineID_3']),
    };
  });
}

async function applyJobThaiStructuredData(page, record) {
  const structured = await extractJobThaiStructuredData(page);

  record.first_name = structured.first_name || record.first_name;
  record.last_name = structured.last_name || record.last_name;
  record.address = structured.address || record.address;
  record.province = structured.province || record.province;
  record.gender = structured.gender || record.gender;
  record.birth_date = structured.birth_date || record.birth_date;
  record.age = structured.age || record.age;
  record.nationality = structured.nationality || record.nationality;
  record.religion = structured.religion || record.religion;
  record.marital_status = structured.marital_status || record.marital_status;
  record.height = structured.height || record.height;
  record.weight = structured.weight || record.weight;
  record.desired_positions = structured.desired_positions || record.desired_positions;
  record.expected_salary = structured.expected_salary || record.expected_salary;
  record.desired_work_area = structured.desired_work_area || record.desired_work_area;
  record.job_type = structured.job_type || record.job_type;
  record.available_start = structured.available_start || record.available_start;

  if (structured.education?.length) {
    record.education = structured.education;
    record.education_summary = summarizeEducation(structured.education);
  }
  if (structured.work_experience?.length) {
    record.work_experience = structured.work_experience;
    record.experience_summary = summarizeExperience(structured.work_experience);
  }

  const nameSplit = splitThaiFullName([record.first_name, record.last_name].filter(Boolean).join(' '));
  record.prefix = nameSplit.prefix;
  record.first_name = nameSplit.first_name || record.first_name;
  record.last_name = nameSplit.last_name || record.last_name;
  record.name = nameSplit.name || [record.first_name, record.last_name].filter(Boolean).join(' ');

  const resumeId = jobthaiResumeIdFromUrl(page.url());
  if (resumeId) {
    const genderCode = /หญิง/i.test(record.gender) ? 'f' : 'm';
    record.profile_image_url = `https://www3.jobthai.com/service/resume_image.php?code=${resumeId}&gender=${genderCode}&size=normal&unlock=1`;
  }
}

export async function saveDebugPage(page, pngPath, htmlPath, debugMode = false) {
  if (!debugMode) return;
  await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
  const html = await page.content();
  await writeFile(htmlPath, html, 'utf8');
}

export async function logStep(label, page) {
  console.log(`[${label}] ${page.url()}`);
}

export async function parseResumeDetailPage(page, meta) {
  await revealJobThaiContacts(page);

  const contacts = await readContactFields(page);
  const rawText = cleanText(await page.locator('body').innerText().catch(() => ''));
  const record = emptyResumeRecord();

  await applyJobThaiStructuredData(page, record);

  record.phone = isMaskedContact(contacts.phone) ? '' : cleanText(contacts.phone);
  if (!record.phone) record.phone = extractPhoneFromText(rawText);
  record.email = isMaskedContact(contacts.email) ? '' : cleanText(contacts.email);
  if (!record.email) record.email = extractEmailFromText(rawText);
  record.line_id = isMaskedContact(contacts.line_id) ? '' : cleanText(contacts.line_id);

  if (record.address && !record.province) {
    const provinceMatch = record.address.match(/(กรุงเทพมหานคร|[ก-๙]+)/u);
    record.province = provinceMatch?.[1] || record.desired_work_area;
  }

  const resumeId = jobthaiResumeIdFromUrl(meta.sourceUrl || page.url());
  return {
    source: meta.source ?? 'jobthai',
    platform: meta.platform ?? 'jobthai',
    source_url: meta.sourceUrl || page.url(),
    resume_id: resumeId,
    focus_position: meta.focusPosition || '',
    candidate_index: meta.index,
    index: meta.index,
    scraped_at: new Date().toISOString(),
    ...record,
    raw_text: rawText,
    raw_text_preview: rawText.slice(0, 500),
    parse_status: getParseStatus(record, rawText),
  };
}

export async function collectResumeLinks(page, debugMode = false, options = {}) {
  const maxNeeded = options.maxNeeded ?? options.maxCandidates ?? 999;
  const all = [];
  const seen = new Set();
  let pagesScanned = 0;
  let totalAvailable = await readJobThaiTotalAvailable(page);

  while (all.length < maxNeeded) {
    pagesScanned += 1;
    const items = await extractJobThaiLinksFromPage(page);
    let added = 0;
    for (const item of items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      all.push(item);
      added += 1;
      if (all.length >= maxNeeded) break;
    }

    if (debugMode) {
      console.log(`[JobThai] Page ${pagesScanned}: +${added} links (total collected ${all.length}/${maxNeeded})`);
    }

    if (all.length >= maxNeeded) break;

    const nextUrl = await getJobThaiNextPageUrl(page);
    if (!nextUrl) break;

    await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForJobThaiSearchResults(page);
    await sleep(800);
  }

  const links = all.slice(0, maxNeeded);
  if (debugMode) {
    console.log(
      `\n--- JobThai resume links: ${links.length} collected, site total ~${totalAvailable ?? 'unknown'}, pages ${pagesScanned} ---`,
    );
    for (const item of links) {
      console.log(`  [${item.strategy}] ${item.resumeId} "${item.text}" -> ${item.url}`);
    }
  }

  if (options.withMeta) {
    return { links, meta: { totalAvailable, pagesScanned, collected: links.length } };
  }
  return links;
}

async function extractJobThaiLinksFromPage(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();

    const add = (url, text, strategy) => {
      if (!url || seen.has(url)) return;
      if (!/\/resume\/\d+,\d+/i.test(url)) return;
      const absolute = url.startsWith('http') ? url : new URL(url, window.location.href).href;
      seen.add(absolute);
      const idMatch = absolute.match(/\/resume\/\d+,(\d+)/i);
      results.push({
        url: absolute,
        href: absolute,
        text: text || `resume-${idMatch?.[1] || ''}`,
        matchReason: `resume_id:${idMatch?.[1] || ''}`,
        strategy,
        resumeId: idMatch?.[1] || '',
      });
    };

    function cleanInner(el) {
      return (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    }

    for (const el of document.querySelectorAll('[onclick]')) {
      const onclick = el.getAttribute('onclick') || '';
      const match = onclick.match(/window\.open\(['"]([^'"]*\/resume\/[^'"]+)['"]/i);
      if (match) add(match[1], cleanInner(el), 'window_open');
    }

    for (const a of document.querySelectorAll('a[href*="/resume/"]')) {
      add(a.href, cleanInner(a), 'href');
    }

    return results;
  });
}

async function getJobThaiNextPageUrl(page) {
  return page.evaluate(() => {
    const next = document.querySelector(
      'a[ga-name="resume_list_pagination"][ga-value="top_next"], a[ga-name="resume_list_pagination"][ga-value="bottom_next"]',
    );
    if (!next) return null;
    const href = next.getAttribute('href');
    if (!href || href === '#') return null;
    return href.startsWith('http') ? href : new URL(href, window.location.href).href;
  });
}

async function readJobThaiTotalAvailable(page) {
  return page.evaluate(() => {
    const sel = document.querySelector(
      '[ga-name="resume_list_pagination_top_dropdown"], [ga-name="resume_list_pagination_bottom_dropdown"]',
    );
    if (!sel) return null;
    const opts = [...sel.options];
    if (!opts.length) return null;
    const last = opts[opts.length - 1].textContent.trim();
    const m = last.match(/(\d+)\s*-\s*(\d+)/);
    if (m) return Number.parseInt(m[2], 10);
    return null;
  });
}

export async function saveResultLinks(links, outputDir = OUTPUT_DIR) {
  const lines = [`JobThai resume links: ${new Date().toISOString()}`, `Total: ${links.length}`, ''];
  for (let i = 0; i < links.length; i += 1) {
    const item = links[i];
    lines.push(`${i + 1}. [${item.strategy}/${item.matchReason}] "${item.text}" -> ${item.url}`);
  }
  await writeFile(join(outputDir, 'result-links.txt'), `${lines.join('\n')}\n`, 'utf8');
}

export function loadJobThaiConfig() {
  return {
    platform: 'jobthai',
    employerLoginUrl: envString(
      'JOBTHAI_LOGIN_URL',
      'https://auth.jobthai.com/companies/login?client_id=NlnJk4E3pLR2TBGu930OQXJAiy9mJ7sWpZ8w8RAq&response_type=code&redirect_uri=https%3A%2F%2Fwww.jobthai.com%2Fcallback&scope=login&l=th&type=company',
    ),
    resumeSearchUrl: envString('JOBTHAI_RESUME_SEARCH_URL', 'https://www3.jobthai.com/findresume/findresume.php?l=th'),
    username: envString('JOBTHAI_USERNAME'),
    password: envString('JOBTHAI_PASSWORD'),
  };
}

export function jobthaiPreflight(config) {
  const errors = [];
  const warnings = [];
  if (!config.username || !config.password) {
    errors.push('JOBTHAI_USERNAME / JOBTHAI_PASSWORD ไม่ครบใน .env');
  }
  if (!config.employerLoginUrl) errors.push('JOBTHAI_LOGIN_URL ไม่ได้ตั้งใน .env');
  if (!config.resumeSearchUrl) errors.push('JOBTHAI_RESUME_SEARCH_URL ไม่ได้ตั้งใน .env');
  return { warnings, errors };
}

export async function collectCriteria(context, defaultMaxCandidates) {
  const envPlatform = process.env.SCRAPE_PLATFORM ?? 'jobthai';
  const { criteria, workPage } = await collectSharedCriteria(context, defaultMaxCandidates, envPlatform);
  return { ...criteria, platform: 'jobthai', _workPage: workPage };
}

export async function prepareSession(page, config, debugMode = false) {
  console.log(`[JobThai] Opening company login: ${config.employerLoginUrl}`);
  await page.goto(config.employerLoginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(1500);
  await markJobThaiTab(page, 'JobThai');
  await saveDebugPage(page, join(OUTPUT_DIR, '02-jobthai-login.png'), join(OUTPUT_DIR, '02-jobthai-login.html'), debugMode);

  await page.locator('#login-form-username').fill(config.username);
  await page.locator('#login-form-password').fill(config.password);
  await page.locator('#login_company').click();
  await waitForJobThaiLoginComplete(page);
  await saveDebugPage(page, join(OUTPUT_DIR, '03-jobthai-after-login.png'), join(OUTPUT_DIR, '03-jobthai-after-login.html'), debugMode);

  if (!/findresume/i.test(page.url())) {
    console.log(`[JobThai] Opening resume search: ${config.resumeSearchUrl}`);
    await page.goto(config.resumeSearchUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(2000);
  }

  if (!(await isJobThaiEmployerLoggedIn(page))) {
    throw new Error(
      'JobThai session หลุดหลัง login — ไม่พบเมนู employer (ค้นประวัติ/ออกจากระบบ). ลอง HEADLESS=false และรอ redirect ให้ครบ',
    );
  }

  await markJobThaiTab(page, 'JobThai');
  await logStep('JobThai find resume page ready', page);
}

export async function applyFilters(page, criteria, config) {
  return applyJobThaiFilters(page, criteria);
}

export async function runSearch(page) {
  await clickJobThaiSearchButton(page);
  await waitForJobThaiSearchResults(page);
}

export async function downloadAssets(context, parsed, candidateNo, outputDir, page) {
  return downloadCandidateAssets(context, parsed, candidateNo, outputDir, page);
}

export function logCandidateSummary(candidateNo, parsed, page) {
  console.log(`\n=== Candidate ${candidateNo} (${parsed.parse_status}) ===`);
  console.log(`คำนำหน้า: ${parsed.prefix || '-'}`);
  console.log(`ชื่อ: ${parsed.first_name || '-'}`);
  console.log(`นามสกุล: ${parsed.last_name || '-'}`);
  console.log(`เบอร์โทร: ${parsed.phone || '-'}`);
  console.log(`ที่อยู่: ${parsed.address || '-'}`);
  console.log(`อีเมล: ${parsed.email || '-'}`);
  console.log(`Line: ${parsed.line_id || '-'}`);
  console.log(`รูปโปรไฟล์: ${parsed.profile_image_local || parsed.profile_image_url || '-'}`);
  if (parsed.attachments?.length) {
    console.log(`ไฟล์แนบ: ${parsed.attachments.length} ไฟล์`);
    for (const att of parsed.attachments) {
      console.log(`  - ${att.title}: ${att.local_path || att.source_url} (${att.download_status || '-'})`);
    }
  }
  if (parsed.education?.length) {
    console.log(`การศึกษา: ${parsed.education.length} รายการ`);
    for (const edu of parsed.education) {
      console.log(`  - ${edu.institution || '-'} | ${edu.degree || '-'} | ${edu.major || '-'}`);
    }
  }
  if (parsed.work_experience?.length) {
    console.log(`ประสบการณ์ทำงาน: ${parsed.work_experience.length} รายการ`);
    for (const job of parsed.work_experience) {
      console.log(`  - ${job.position || '-'} @ ${job.company || '-'} (${job.year || job.period || '-'})`);
    }
  }
  console.log(`URL: ${page?.url?.() || parsed.source_url || '-'}`);
}
