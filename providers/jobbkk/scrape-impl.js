import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSharedCriteria } from '../../config-popup.js';
import { applyJobBkkFilters, clickSearchButton, waitForSearchResults } from '../../jobbkk-filters.js';
import { attachmentsSummary, attachmentFileId, downloadCandidateAssets, isAttachmentUrl } from '../../candidate-assets.js';
import { defaultDedupeKey, isSiteEmail, isSitePhone } from '../../core/candidate-dedupe.js';
import { envBool, envInt, envString, sleep } from '../../core/env.js';
import {
  waitForEmployerLoginComplete,
  waitForResumePageReady,
} from '../../scrape-timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '..', '..');
export const OUTPUT_DIR = join(PROJECT_ROOT, 'output');

const HREF_PATTERNS = [
  '/resumes/',
  'resumes/view',
  'resumes/detail',
  'resume',
  'candidate',
  'applicant',
  'profile',
  'member',
  'talent',
];

const TEXT_PATTERNS = [
  'อ่านประวัติ',
  'ดูประวัติ',
  'รายละเอียด',
  'ดูรายละเอียด',
  'Resume',
  'ประวัติ',
  'View',
  'ดูข้อมูล',
];

const BAD_LINK_PATTERNS = [
  /download_attach/i,
  /download_professional_license/i,
  /logout/i,
  /login/i,
  /employer\/dashboard/i,
  /\bdashboard\b/i,
  /setting/i,
  /report/i,
  /article/i,
  /help/i,
  /policy/i,
  /javascript:void/i,
];

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

const CONTACT_ICON_MAP = {
  'phone.svg': 'phone',
  'mail.svg': 'email',
  'line.svg': 'line_id',
  'facebook.svg': 'facebook',
  'location.png': 'address',
};

const LOGIN_BUTTON_TEXTS = ['เข้าสู่ระบบ', 'Login', 'Sign in'];
const USERNAME_SELECTORS = [
  'input[name*="username" i]',
  'input[name*="email" i]',
  'input[name*="user" i]',
  'input[type="email"]',
  'input[type="text"]',
];

const PASSWORD_SELECTORS = ['input[type="password"]', 'input[name*="password" i]'];

function cleanText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rawTextPreview(rawText, maxLen = 500) {
  return cleanText(rawText).slice(0, maxLen);
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return '';
}

function listToText(value) {
  if (Array.isArray(value)) return value.join(' | ');
  return cleanText(value);
}

function getParseStatus(record, rawText) {
  if (!rawText) return 'failed';
  const hasContact = cleanText(record.phone) || cleanText(record.email);
  if (cleanText(record.name) && hasContact) return 'success';
  return 'partial';
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

function isBadLink(href, text = '') {
  const normalizedHref = (href ?? '').trim();
  const combined = `${normalizedHref} ${text}`.toLowerCase();
  if (!normalizedHref || normalizedHref === '#') return true;
  if (normalizedHref.startsWith('javascript:void')) return true;
  return BAD_LINK_PATTERNS.some((pattern) => pattern.test(combined));
}

function toAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

async function extractAttachmentsFromPage(page) {
  const baseUrl = page.url();
  const seen = new Set();
  const items = [];
  const selectors = [
    'a[href*="download_attach"]',
    'a[href*="download_professional_license"]',
  ];

  for (const selector of selectors) {
    const links = page.locator(selector);
    const count = await links.count();
    for (let i = 0; i < count; i += 1) {
      const link = links.nth(i);
      if (!(await link.isVisible().catch(() => false))) continue;
      const href = (await link.getAttribute('href').catch(() => '')) ?? '';
      const url = toAbsoluteUrl(href, baseUrl);
      if (!isAttachmentUrl(url) || seen.has(url)) continue;
      seen.add(url);

      let title = cleanText(await link.innerText().catch(() => ''));
      if (!title) title = cleanText(await link.getAttribute('title').catch(() => ''));
      if (!title) {
        const parentText = cleanText(await link.locator('xpath=ancestor::div[1]').innerText().catch(() => ''));
        title = parentText.split('\n')[0] || `attachment-${items.length + 1}`;
      }

      items.push({ title, source_url: url, file_id: attachmentFileId(url) });
    }
  }

  return items;
}

export function dedupeKey(candidate) {
  return defaultDedupeKey(candidate);
}

export async function logStep(stepName, page) {
  console.log(`\n=== ${stepName} ===`);
  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
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
  console.log(`URL: ${page.url()}`);
}

export async function saveDebugPage(page, pngPath, htmlPath, enabled = true) {
  if (!enabled) return;
  await page.screenshot({ path: pngPath, fullPage: true });
  await writeFile(htmlPath, await page.content(), 'utf8');
}

async function getText(page, selector) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return '';
  return cleanText(await locator.innerText().catch(() => ''));
}

async function getListText(page, selector) {
  const locator = page.locator(selector);
  const count = await locator.count();
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const text = cleanText(await locator.nth(i).innerText().catch(() => ''));
    if (text) items.push(text);
  }
  return items;
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
      const lines = [];
      if (item.year) lines.push(item.year);
      if (item.company) lines.push(`ข้อมูลบริษัท : ${item.company}`);
      if (item.business_type) lines.push(`ประเภทธุรกิจ : ${item.business_type}`);
      if (item.position) lines.push(`ตำแหน่งงาน : ${item.position}`);
      if (item.period) lines.push(`ระยะเวลา : ${item.period}`);
      if (item.salary) lines.push(`เงินเดือน(บาท) : ${item.salary}`);
      if (item.address) lines.push(`ที่อยู่ : ${item.address}`);
      if (item.responsibilities) lines.push(`รายละเอียดงาน : ${item.responsibilities}`);
      return lines.join(' ');
    })
    .join(' ');
}

async function extractStructuredEducationExperience(page) {
  return page
    .evaluate(() => {
      const normalize = (value) => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

      const readField = (block, labels, detail = false) => {
        for (const label of labels) {
          const paragraphs = block.querySelectorAll('p');
          for (const paragraph of paragraphs) {
            const text = normalize(paragraph.textContent);
            if (!text.includes(label)) continue;

            if (detail) {
              const sibling = paragraph.nextElementSibling;
              if (sibling && sibling.tagName === 'P') {
                return normalize(sibling.textContent);
              }
            }

            const span = paragraph.querySelector('span');
            const spanText = normalize(span?.textContent || '');
            if (spanText.includes(label)) {
              const value = text.replace(spanText, '').replace(/^[\s:]+/, '').trim();
              if (value) return value;
            }

            const match = text.match(new RegExp(`${label}\\s*[:：]\\s*(.+)`));
            if (match?.[1]) return normalize(match[1]);
          }
        }
        return '';
      };

      const education = [...document.querySelectorAll('.education .timeline-2 .content-2')]
        .map((block) => ({
          institution: normalize(block.querySelector('h5')?.textContent),
          graduation_year: readField(block, ['ปีที่จบการศึกษา', 'ปีที่จบ']),
          degree: readField(block, ['วุฒิการศึกษา']),
          faculty: readField(block, ['คณะวิชา']),
          major: readField(block, ['สาขา']),
          gpa: readField(block, ['เกรด']),
        }))
        .filter((item) => item.institution || item.degree || item.major);

      const work_experience = [...document.querySelectorAll('.skills .timeline-2 .content-2')]
        .map((block) => ({
          year: normalize(block.querySelector('h2')?.textContent),
          company: readField(block, ['ข้อมูลบริษัท']),
          business_type: readField(block, ['ประเภทธุรกิจ']),
          position: readField(block, ['ตำแหน่งงาน']),
          period: readField(block, ['ระยะเวลา']),
          salary: readField(block, ['เงินเดือน']),
          address: readField(block, ['ที่อยู่']),
          responsibilities: readField(block, ['รายละเอียดงาน'], true),
        }))
        .filter((item) => item.company || item.position || item.year);

      return { education, work_experience };
    })
    .catch(() => ({ education: [], work_experience: [] }));
}

async function applyStructuredEducationExperience(page, record) {
  const { education, work_experience: workExperience } = await extractStructuredEducationExperience(page);

  if (education.length) {
    record.education = education;
    record.education_summary = summarizeEducation(education);
  }

  if (workExperience.length) {
    record.work_experience = workExperience;
    record.experience_summary = summarizeExperience(workExperience);
  }
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
    if (item.year) lines.push(`* ปี: ${item.year}`);
    if (item.period) lines.push(`* ระยะเวลา: ${item.period}`);
    if (item.salary) lines.push(`* เงินเดือน: ${item.salary}`);
    if (item.business_type) lines.push(`* ประเภทธุรกิจ: ${item.business_type}`);
    if (item.address) lines.push(`* ที่อยู่: ${item.address}`);
    if (item.responsibilities) {
      lines.push('* รายละเอียด:');
      for (const line of item.responsibilities.split(/\n+/).map(cleanText).filter(Boolean)) {
        lines.push(`  - ${line}`);
      }
    }
    lines.push('');
    return lines;
  });
}

async function extractContactByIcon(page, iconKeyword) {
  const rows = page.locator('.contact-detail .data-member-detail');
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const src = ((await row.locator('img').first().getAttribute('src').catch(() => '')) ?? '').toLowerCase();
    if (!src.includes(iconKeyword.toLowerCase())) continue;
    return cleanText(await row.innerText().catch(() => ''));
  }
  return '';
}

async function extractAllContacts(page) {
  const contacts = { phone: '', email: '', line_id: '', facebook: '', address: '' };
  for (const [icon, field] of Object.entries(CONTACT_ICON_MAP)) {
    let value = await extractContactByIcon(page, icon);
    if (field === 'phone') value = normalizePhone(value);
    if (field === 'address') value = stripLeadingDash(value);
    contacts[field] = value;
  }
  return contacts;
}

async function extractValueAfterLabelFromSection(page, sectionSelector, labelText) {
  const section = page.locator(sectionSelector).first();
  if ((await section.count()) === 0) return '';

  const sectionText = await section.innerText().catch(() => '');
  if (!sectionText) return '';

  const pattern = new RegExp(`${escapeRegex(labelText)}\\s*[:\\-]?\\s*([^\\n]+)`, 'iu');
  const match = sectionText.match(pattern);
  if (match?.[1]) return cleanText(match[1]);

  const labeled = section.getByText(labelText, { exact: false }).first();
  if ((await labeled.count()) === 0) return '';

  const rowText = cleanText(
    await labeled.locator('xpath=ancestor::*[self::div or self::li or self::tr or self::p][1]').innerText().catch(() => ''),
  );
  if (!rowText) return '';
  return cleanText(rowText.replace(new RegExp(`^${escapeRegex(labelText)}\\s*[:\\-]?\\s*`, 'iu'), ''));
}

function extractAgeFromApplicantInfo(rawText) {
  const paren = rawText.match(/\((\d{1,2})\s*ปี\)/u);
  if (paren?.[1]) return paren[1];
  return firstMatch(rawText, [/(?:อายุ|Age)\s*[:\-]?\s*(\d{1,2})\s*(?:ปี|years?)?/iu]);
}

function extractBirthDate(rawText) {
  return firstMatch(rawText, [
    /(?:วันเกิด|Birth(?:day| Date)?)\s*[:\\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/iu,
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
  ]);
}

function normalizePhone(value) {
  const digits = cleanText(value).replace(/\D/g, '');
  if (isSitePhone(digits)) return '';
  return digits || cleanText(value);
}

function stripLeadingDash(value) {
  return cleanText(value).replace(/^[-–—]\s*/, '');
}

function extractProvinceFromAddress(address) {
  const text = cleanText(address);
  if (!text) return '';
  const beforeCountry = text.replace(/\s*ประเทศไทย\s*$/u, '').trim();
  const postalMatch = beforeCountry.match(/([ก-๙a-zA-Z][ก-๙a-zA-Z\s./-]*?)\s+(\d{5})\s*$/u);
  if (postalMatch?.[1]) {
    const parts = postalMatch[1].trim().split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    if (last && last !== 'ประเทศไทย') return last;
  }
  return firstMatch(text, [/จังหวัด\s*([^\s,]+)/u, /([ก-๙]+มหานคร)/u]);
}

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

function splitThaiName(fullName) {
  return splitThaiFullName(fullName);
}

function extractPhoneFromText(text) {
  return firstMatch(text, [
    /(?:เบอร์|โทร|Tel|Phone)\s*[:.]?\s*([0-9\-]{9,15})/iu,
    /\b(0\d[\d\-]{8,12})\b/,
  ]);
}

function extractEmailFromText(text) {
  const email = firstMatch(text, [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i]);
  return isSiteEmail(email) ? '' : email;
}

function extractLineFromText(text) {
  return firstMatch(text, [/(?:Line|ไลน์)\s*[:.]?\s*(@?[A-Za-z0-9._-]{3,})/iu]);
}

async function extractPreviewNewNameParts(page) {
  const nameEl = page.locator('h3.jobseeker-name').first();
  if ((await nameEl.count()) > 0) {
    const divs = nameEl.locator('div');
    const count = await divs.count();
    const parts = [];
    for (let i = 0; i < count; i += 1) {
      const text = cleanText(await divs.nth(i).innerText().catch(() => ''));
      if (text) parts.push(text);
    }
    if (parts.length >= 2) {
      return {
        first_name: parts[0],
        last_name: parts.slice(1).join(' '),
        name: parts.join(' '),
      };
    }
    if (parts.length === 1) {
      return splitThaiFullName(parts[0]);
    }
  }
  return null;
}

async function extractPreviewNewContacts(page) {
  const contacts = { phone: '', email: '', line_id: '', address: '' };
  const header = page.locator('.header-name').first();
  if ((await header.count()) === 0) return contacts;

  const extractAfterLabel = async (labelText) => {
    const label = header.locator('h5').filter({ hasText: labelText }).first();
    if ((await label.count()) === 0) return '';
    const valueEl = label.locator('xpath=following-sibling::p[1]').first();
    if ((await valueEl.count()) === 0) return '';
    return stripLeadingDash(await valueEl.innerText().catch(() => ''));
  };

  contacts.address = await extractAfterLabel('ที่อยู่ปัจจุบัน');
  contacts.phone = normalizePhone(await extractAfterLabel('เบอร์โทรศัพท์'));
  contacts.email = await extractAfterLabel('อีเมล');
  contacts.line_id = await extractAfterLabel('Line');

  return contacts;
}

async function parsePreviewNewPage(page, record, rawText) {
  const nameParts = await extractPreviewNewNameParts(page);
  if (nameParts?.name) {
    Object.assign(record, splitThaiFullName(nameParts.name));
    if (nameParts.first_name && !record.prefix) {
      record.first_name = nameParts.first_name;
      record.last_name = nameParts.last_name;
      record.name = nameParts.name;
    }
  }

  if (!record.name) {
    const nameCandidates = [
      'h3.jobseeker-name',
      '.main-name h1',
      '.main-name h2',
      '.main-name h3',
      '.longer-name h1',
      '.longer-name h2',
      '.longer-name h3',
      '.main-name .name',
    ];
    for (const sel of nameCandidates) {
      const text = await getText(page, sel);
      if (text && !/preview resume/i.test(text)) {
        Object.assign(record, splitThaiFullName(text));
        break;
      }
    }
  }

  Object.assign(record, await extractPreviewNewContacts(page));

  const contactBlock = await getText(page, '.header-name, .ownerLogin, .contact-owner');
  const contactText = contactBlock || rawText;
  if (!record.phone) record.phone = normalizePhone(extractPhoneFromText(contactText));
  if (!record.email) record.email = extractEmailFromText(contactText);
  if (!record.line_id) record.line_id = extractLineFromText(contactText);
  if (!record.address) {
    record.address = firstMatch(rawText, [/ที่อยู่ปัจจุบัน[\s\S]*?\n\s*[-–]?\s*([^\n]+)/u]);
    if (record.address) record.address = stripLeadingDash(record.address);
  }

  if (!record.intro) {
    record.intro = await getText(page, '.header-name .flex-column p.break_word');
  }

  record.expected_salary = record.expected_salary || firstMatch(rawText, [/เงินเดือนที่ต้องการ\s*\n?\s*([\d,\s\-]+)/u]);
  record.desired_work_area = record.desired_work_area || firstMatch(rawText, [/พื้นที่ที่ต้องการทำงาน\s*:\s*([^\n]+)/u]);
  record.available_start = record.available_start || firstMatch(rawText, [/ระยะเวลาเริ่มงาน\s*:\s*([^\n]+)/u]);
  record.gender = record.gender || firstMatch(rawText, [/เพศ\s*:\s*([^\n]+)/u]);
  record.age = record.age || extractAgeFromApplicantInfo(rawText);
  record.military_status = record.military_status || firstMatch(rawText, [/สถานภาพทางทหาร\s*\n?\s*([^\n]+)/u]);

  const desiredSection = rawText.match(/งานที่ต้องการ([\s\S]*?)ประวัติการศึกษา/u);
  if (desiredSection?.[1]) {
    const positions = [...desiredSection[1].matchAll(/ตำแหน่ง\s*:\s*([^\n]+)/gu)].map((m) => cleanText(m[1]));
    if (positions.length) record.desired_positions = positions.join(', ');
  }

  const eduMatch = rawText.match(/ประวัติการศึกษา([\s\S]*?)ประวัติการทำงาน/u);
  if (eduMatch?.[1]) record.education_summary = cleanText(eduMatch[1]);

  const expMatch = rawText.match(/ประวัติการทำงาน\/ฝึกงาน([\s\S]*?)(?:ข้อมูลการฝึกอบรม|ทักษะความรู้)/u);
  if (expMatch?.[1]) record.experience_summary = cleanText(expMatch[1]);

  const hardSkills = await getListText(page, '#premium-wizrsm-body .hard-skill li, .hard-skill li');
  if (hardSkills.length) record.hard_skills = hardSkills;
  else {
    const hardBlock = rawText.match(/Hard Skills([\s\S]*?)(?:Soft Skills|ทักษะเสริม)/u);
    if (hardBlock?.[1]) {
      record.hard_skills = hardBlock[1].split('\n').map(cleanText).filter((l) => l.startsWith('-') || l.includes('ทักษะ'));
    }
  }

  const softSkills = await getListText(page, '#premium-wizrsm-body .soft-skill li, .soft-skill li');
  if (softSkills.length) record.soft_skills = softSkills;

  const profileImg = page.locator('.pic-profile img, .main-name img').first();
  if ((await profileImg.count()) > 0) {
    record.profile_image_url = (await profileImg.getAttribute('src').catch(() => '')) ?? '';
  }
}

export async function parseResumeDetailPage(page, meta) {
  const { sourceUrl, focusPosition, index, source = 'resume_search_talent' } = meta;
  const base = {
    index,
    scraped_at: new Date().toISOString(),
    focus_position: focusPosition,
    source,
    source_url: sourceUrl,
    parse_status: 'failed',
    raw_text_preview: '',
    ...emptyResumeRecord(),
  };

  let rawText = '';
  try {
    rawText = await page.locator('body').innerText();
  } catch {
    return base;
  }

  if (!rawText) return base;

  const record = emptyResumeRecord();

  record.name = await getText(page, '.rsm-name span');
  if (!record.name) {
    await parsePreviewNewPage(page, record, rawText);
  } else {
    const profileImg = page.locator('.img-profile').first();
    if ((await profileImg.count()) > 0) {
      record.profile_image_url = (await profileImg.getAttribute('src').catch(() => '')) ?? '';
    }

    Object.assign(record, await extractAllContacts(page));
    record.intro = await getText(page, '#introduce_yourself p:last-child');
    record.education_summary = await getText(page, '#education_page1');
    record.experience_summary = await getText(page, '#experience_page1');

    record.desired_positions = await extractValueAfterLabelFromSection(page, '#rsm-request', 'ตำแหน่ง');
    record.desired_work_area = await extractValueAfterLabelFromSection(
      page,
      '#rsm-request',
      'พื้นที่ที่ต้องการทำงาน',
    );
    record.job_type = await extractValueAfterLabelFromSection(page, '#rsm-request', 'ประเภทงาน');
    record.expected_salary = await extractValueAfterLabelFromSection(page, '#rsm-request', 'เงินเดือน');
    record.available_start = await extractValueAfterLabelFromSection(page, '#rsm-request', 'ระยะเวลาเริ่มงาน');

    record.gender = await extractValueAfterLabelFromSection(page, '#rsm-info', 'เพศ');
    record.nationality = await extractValueAfterLabelFromSection(page, '#rsm-info', 'สัญชาติ');
    record.religion = await extractValueAfterLabelFromSection(page, '#rsm-info', 'ศาสนา');
    record.height = await extractValueAfterLabelFromSection(page, '#rsm-info', 'ส่วนสูง');
    record.weight = await extractValueAfterLabelFromSection(page, '#rsm-info', 'น้ำหนัก');
    record.marital_status = await extractValueAfterLabelFromSection(page, '#rsm-info', 'สถานะ');
    record.military_status = await extractValueAfterLabelFromSection(page, '#rsm-info', 'สถานภาพทางทหาร');
    record.vehicle = await extractValueAfterLabelFromSection(page, '#rsm-info', 'ยานพาหนะที่มี');
    record.driving_license = await extractValueAfterLabelFromSection(page, '#rsm-info', 'ใบขับขี่');
    record.driving_ability = await extractValueAfterLabelFromSection(page, '#rsm-info', 'ความสามารถในการขับขี่');

    const applicantInfoText = await getText(page, '#rsm-info');
    record.age = extractAgeFromApplicantInfo(applicantInfoText || rawText);
    record.birth_date = extractBirthDate(applicantInfoText || rawText);

    record.hard_skills = await getListText(page, '#rsm-hard-skill li');
    record.soft_skills = await getListText(page, '#rsm-soft-skill li');
    record.language_skills = await getListText(page, '.lang-skill');
    record.typing_skills = cleanText(await page.locator('.lang-skill-score').first().innerText().catch(() => ''));

    if (!record.desired_positions) {
      record.desired_positions = await getText(page, '#rsm-request');
    }
  }

  if (!record.name && /\/resumes\/preview_new\//i.test(meta.sourceUrl || page.url())) {
    await parsePreviewNewPage(page, record, rawText);
  }

  if (!record.phone) record.phone = normalizePhone(extractPhoneFromText(rawText));
  if (!record.email) record.email = extractEmailFromText(rawText);
  if (!record.line_id) record.line_id = extractLineFromText(rawText);

  const nameSplit = splitThaiFullName(record.name);
  record.prefix = nameSplit.prefix;
  record.first_name = record.first_name || nameSplit.first_name;
  record.last_name = record.last_name || nameSplit.last_name;
  record.name = nameSplit.name || record.name;

  if (record.address && !record.province) {
    record.province = extractProvinceFromAddress(record.address);
  }
  if (!record.province && record.desired_work_area) {
    record.province = firstMatch(record.desired_work_area, [/([ก-๙]+มหานคร|[ก-๙]+)/u]);
  }

  record.attachments = await extractAttachmentsFromPage(page);
  await applyStructuredEducationExperience(page, record);

  return {
    ...base,
    ...record,
    raw_text: rawText,
    raw_text_preview: rawTextPreview(rawText),
    parse_status: getParseStatus(record, rawText),
  };
}

export async function inspectPage(page) {
  const lines = [];
  const record = (line = '') => {
    console.log(line);
    lines.push(line);
  };

  record(`Inspection time: ${new Date().toISOString()}`);
  record(`URL: ${page.url()}`);
  record(`Title: ${await page.title()}`);

  const allLinks = page.locator('a');
  const allButtons = page.locator('button');
  record(`Total links: ${await allLinks.count()}`);
  record(`Total buttons: ${await allButtons.count()}`);

  record('');
  record('--- First 150 visible link texts with href ---');
  let visibleLinks = 0;
  const linkCount = await allLinks.count();
  for (let i = 0; i < linkCount && visibleLinks < 150; i += 1) {
    const link = allLinks.nth(i);
    if (!(await link.isVisible().catch(() => false))) continue;
    const text = cleanText(await link.innerText().catch(() => ''));
    const href = (await link.getAttribute('href').catch(() => '')) ?? '';
    visibleLinks += 1;
    record(`${visibleLinks}. "${text || '(empty)'}" -> ${href}`);
  }

  record('');
  record('--- First 150 visible button texts ---');
  let visibleButtons = 0;
  const buttonCount = await allButtons.count();
  for (let i = 0; i < buttonCount && visibleButtons < 150; i += 1) {
    const button = allButtons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    visibleButtons += 1;
    record(`${visibleButtons}. "${cleanText(await button.innerText().catch(() => '')) || '(empty)'}"`);
  }

  const bodyText = await page.locator('body').innerText();
  record('');
  record('--- First 3000 characters of visible body text ---');
  record(bodyText.slice(0, 3000));

  const inspectionPath = join(OUTPUT_DIR, 'page-inspection.txt');
  await writeFile(inspectionPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Page inspection saved to: ${inspectionPath}`);
}

async function findVisibleLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      return locator;
    }
  }
  return null;
}

async function clickByTexts(page, texts, roles = ['button', 'link']) {
  for (const text of texts) {
    for (const role of roles) {
      const locator = page.getByRole(role, { name: text, exact: false }).first();
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        await locator.click();
        return text;
      }
    }
    const generic = page.locator('button, a, input[type="submit"]').filter({ hasText: text }).first();
    if ((await generic.count()) > 0 && (await generic.isVisible().catch(() => false))) {
      await generic.click();
      return text;
    }
  }
  return null;
}

export async function gotoEmployerLogin(page, homeUrl, employerLoginUrl, debugMode = false) {
  if (homeUrl) {
    console.log(`Opening JobBKK home: ${homeUrl}`);
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(1500);
    await saveDebugPage(page, join(OUTPUT_DIR, '01-home.png'), join(OUTPUT_DIR, '01-home.html'), debugMode);
    await logStep('JobBKK home', page);

    const loginSelectors = [
      `a[href="${employerLoginUrl}"]`,
      'a[href*="/login/employer_login"]',
      'a.dropdown-item.dropdownItem[href*="employer_login"]',
    ];

    let clicked = false;
    for (const selector of loginSelectors) {
      const link = page.locator(selector).first();
      if ((await link.count()) > 0 && (await link.isVisible().catch(() => false))) {
        await link.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      const textLink = page.getByRole('link', { name: 'ผู้ประกอบการ', exact: false }).first();
      if ((await textLink.count()) > 0 && (await textLink.isVisible().catch(() => false))) {
        await textLink.click();
        clicked = true;
      }
    }

    if (!clicked) {
      throw new Error('Could not find employer login link. Check output/01-home.png');
    }

    await page.waitForLoadState('domcontentloaded');
    await sleep(1500);
  } else {
    console.log(`Opening employer login (from .env): ${employerLoginUrl}`);
    await page.goto(employerLoginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(1500);
  }

  await saveDebugPage(page, join(OUTPUT_DIR, '02-employer-login.png'), join(OUTPUT_DIR, '02-employer-login.html'), debugMode);
  await logStep('Employer login page', page);
}

export async function loginEmployer(page, username, password, debugMode = false) {
  const usernameField =
    (await findVisibleLocator(page, ['#username_emp', 'input[name="username_emp"]'])) ||
    (await findVisibleLocator(page, USERNAME_SELECTORS));
  const passwordField =
    (await findVisibleLocator(page, ['#password_emp', 'input[name="password_emp"]'])) ||
    (await findVisibleLocator(page, PASSWORD_SELECTORS));

  if (!usernameField || !passwordField) {
    throw new Error('Login form fields not found on employer login page.');
  }

  await usernameField.fill(username);
  await passwordField.fill(password);

  const employerBtn = page.locator('#sign_in_emp, button[name="sign_in_emp"]').first();
  if ((await employerBtn.count()) > 0 && (await employerBtn.isVisible().catch(() => false))) {
    await employerBtn.click();
  } else {
    const clicked = await clickByTexts(page, LOGIN_BUTTON_TEXTS);
    if (!clicked) await passwordField.press('Enter');
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitForEmployerLoginComplete(page);

  await saveDebugPage(page, join(OUTPUT_DIR, '03-login-after.png'), join(OUTPUT_DIR, '03-login-after.html'), debugMode);
  await logStep('After login', page);
}

export async function gotoResumeSearchTalent(page, resumeSearchUrl, debugMode = false) {
  console.log(`Opening Resume Search Talent: ${resumeSearchUrl}`);
  await page.goto(resumeSearchUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.setViewportSize({ width: 1536, height: 864 }).catch(() => {});
  await waitForResumePageReady(page, 15_000);
  await saveDebugPage(
    page,
    join(OUTPUT_DIR, '03-resume-search-talent.png'),
    join(OUTPUT_DIR, '03-resume-search-talent.html'),
    debugMode,
  );
  await logStep('Resume Search Talent', page);
}

function addDetectedLink(seen, results, entry) {
  const key = entry.url || `text:${entry.text}:${entry.matchReason}`;
  if (seen.has(key)) return;
  seen.add(key);
  results.push(entry);
}

function isPremiumListLink(url) {
  if (!url) return true;
  if (/\/resumes\/premium(?:\/|$|\?)/i.test(url)) return true;
  if (/\/resumes\/lists/i.test(url)) return true;
  if (/\/variety\//i.test(url)) return true;
  if (/\/jobs\/lists/i.test(url)) return true;
  return false;
}

async function collectPremiumResumeLinks(page, debugMode, options = {}) {
  const maxNeeded = options.maxNeeded ?? options.maxCandidates ?? 999;
  const all = [];
  const seen = new Set();
  let pagesScanned = 0;

  while (all.length < maxNeeded) {
    pagesScanned += 1;
    const pageItems = await collectPremiumResumeLinksFromCurrentPage(page, seen);
    all.push(...pageItems);

    if (debugMode) {
      console.log(`[JobBKK] Page ${pagesScanned}: +${pageItems.length} links (total ${all.length}/${maxNeeded})`);
    }

    if (all.length >= maxNeeded) break;

    const nextUrl = await getJobBkkNextPageUrl(page);
    if (!nextUrl) break;

    await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForSearchResults(page);
    await sleep(800);
  }

  const links = all.slice(0, maxNeeded);
  if (debugMode) {
    console.log(`\n--- Premium resume links: ${links.length} collected, pages ${pagesScanned} ---`);
    for (const item of links) {
      console.log(`  [${item.strategy}] ${item.resumeId} "${item.text}" -> ${item.url}`);
    }
  }

  if (options.withMeta) {
    return { links, meta: { pagesScanned, collected: links.length } };
  }
  return links;
}

async function collectPremiumResumeLinksFromCurrentPage(page, seen) {
  const results = [];
  const origin = new URL(page.url()).origin;

  const links = page.locator('article.bg-resume a.clickShowDetail[data-id], article.bg-resume a.read-profile[data-id]');
  const count = await links.count();
  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    const visible = await link.evaluate((el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
    }).catch(() => false);
    if (!visible) continue;

    const resumeId = (await link.getAttribute('data-id').catch(() => '')) ?? '';
    if (!resumeId) continue;

    const url = `${origin}/resumes/preview_new/${resumeId}`;
    const text = cleanText(await link.innerText().catch(() => ''));
    addDetectedLink(seen, results, {
      url,
      href: url,
      text: text || `resume-${resumeId}`,
      matchReason: `data-id:${resumeId}`,
      strategy: 'premium_data_id',
      resumeId,
    });
  }

  return results;
}

async function getJobBkkNextPageUrl(page) {
  return page.evaluate(() => {
    const pagination = document.querySelector('ul.pagination');
    if (!pagination) return null;

    const gt = [...pagination.querySelectorAll('a.page-link')].find((a) => a.textContent.trim() === '>');
    if (gt) {
      const href = gt.getAttribute('href');
      if (href && href !== '#') {
        return href.startsWith('http') ? href : new URL(href, window.location.href).href;
      }
    }

    const active = pagination.querySelector('li.page-item.active');
    if (!active) return null;
    const nextLi = active.nextElementSibling;
    if (!nextLi) return null;
    const a = nextLi.querySelector('a.page-link');
    const href = a?.getAttribute('href');
    if (!href || href === '#' || a.textContent.trim() === '>') return null;
    return href.startsWith('http') ? href : new URL(href, window.location.href).href;
  });
}

export async function collectResumeLinks(page, debugMode, options = {}) {
  return collectPremiumResumeLinks(page, debugMode, options);
}

export async function saveResultLinks(links, outputDir = OUTPUT_DIR) {
  const lines = [`Detected resume links: ${new Date().toISOString()}`, `Total: ${links.length}`, ''];
  for (let i = 0; i < links.length; i += 1) {
    const item = links[i];
    lines.push(`${i + 1}. [${item.strategy}/${item.matchReason}] "${item.text}" -> ${item.url}`);
  }
  await writeFile(join(outputDir, 'result-links.txt'), `${lines.join('\n')}\n`, 'utf8');
}

export function loadJobbkkConfig() {
  return {
    platform: 'jobbkk',
    homeUrl: envString('JOBBKK_HOME_URL', ''),
    employerLoginUrl: envString('JOBBKK_EMPLOYER_LOGIN_URL'),
    resumeSearchUrl: envString('JOBBKK_RESUME_SEARCH_URL'),
    username: envString('JOBBKK_USERNAME'),
    password: envString('JOBBKK_PASSWORD'),
  };
}

export function jobbkkPreflight(config) {
  const errors = [];
  const warnings = [];
  if (!config.username || !config.password) {
    errors.push('JOBBKK_USERNAME / JOBBKK_PASSWORD ไม่ครบใน .env');
  }
  if (!config.employerLoginUrl) errors.push('JOBBKK_EMPLOYER_LOGIN_URL ไม่ได้ตั้งใน .env');
  if (!config.resumeSearchUrl) errors.push('JOBBKK_RESUME_SEARCH_URL ไม่ได้ตั้งใน .env');
  return { warnings, errors };
}

export async function collectCriteria(context, defaultMaxCandidates) {
  const envPlatform = process.env.SCRAPE_PLATFORM ?? 'jobbkk';
  const { criteria, workPage } = await collectSharedCriteria(context, defaultMaxCandidates, envPlatform);
  return { ...criteria, platform: 'jobbkk', _workPage: workPage };
}

export async function prepareSession(page, config, debugMode = false) {
  await gotoEmployerLogin(page, config.homeUrl, config.employerLoginUrl, debugMode);
  await loginEmployer(page, config.username, config.password, debugMode);
  await gotoResumeSearchTalent(page, config.resumeSearchUrl, debugMode);
}

export async function applyFilters(page, criteria, config) {
  return applyJobBkkFilters(page, criteria, config.resumeSearchUrl);
}

export async function runSearch(page) {
  await clickSearchButton(page);
  await waitForSearchResults(page);
}

export async function downloadAssets(context, parsed, candidateNo, outputDir, page) {
  return downloadCandidateAssets(context, parsed, candidateNo, outputDir, page);
}

export { attachmentFileId, isAttachmentUrl, attachmentsSummary };
