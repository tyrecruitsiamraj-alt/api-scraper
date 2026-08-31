const LATEST_LABEL_RE = /(?:วันที่\s*)?(?:แก้ไข|อัปเดต|อัพเดท|ปรับปรุง).*ล่าสุด|ล่าสุด.*(?:แก้ไข|อัปเดต|อัพเดท|ปรับปรุง)/u;

export function findLatestSortOption(selects) {
  for (const select of selects ?? []) {
    for (const option of select.options ?? []) {
      if (LATEST_LABEL_RE.test(String(option.text ?? '').replace(/\s+/g, ' ').trim())) {
        return { selectIndex: select.index, value: String(option.value ?? ''), selected: Boolean(option.selected) };
      }
    }
  }
  return null;
}

const THAI_MONTH = new Map([
  ['ม.ค.', 1], ['ม.ค', 1], ['มกราคม', 1],
  ['ก.พ.', 2], ['ก.พ', 2], ['กุมภาพันธ์', 2],
  ['มี.ค.', 3], ['มี.ค', 3], ['มีนาคม', 3],
  ['เม.ย.', 4], ['เม.ย', 4], ['เมษายน', 4],
  ['พ.ค.', 5], ['พ.ค', 5], ['พฤษภาคม', 5],
  ['มิ.ย.', 6], ['มิ.ย', 6], ['มิถุนายน', 6],
  ['ก.ค.', 7], ['ก.ค', 7], ['กรกฎาคม', 7],
  ['ส.ค.', 8], ['ส.ค', 8], ['สิงหาคม', 8],
  ['ก.ย.', 9], ['ก.ย', 9], ['กันยายน', 9],
  ['ต.ค.', 10], ['ต.ค', 10], ['ตุลาคม', 10],
  ['พ.ย.', 11], ['พ.ย', 11], ['พฤศจิกายน', 11],
  ['ธ.ค.', 12], ['ธ.ค', 12], ['ธันวาคม', 12],
]);

function christianYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return NaN;
  if (year >= 2400) return year - 543;
  if (year < 100) return 1957 + year; // พ.ศ. 25xx แบบสองหลัก เช่น 69 → 2026
  return year;
}

export function parseProviderUpdatedAt(value, now = new Date()) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const nowMs = now.getTime();
  if (/วันนี้/u.test(text)) return nowMs;
  if (/เมื่อวาน/u.test(text)) return nowMs - 86_400_000;
  const relative = text.match(/(\d+)\s*(นาที|ชั่วโมง|วัน|สัปดาห์|เดือน)\s*(?:ที่แล้ว|ก่อน)?/u);
  if (relative) {
    const unitMs = { นาที: 60_000, ชั่วโมง: 3_600_000, วัน: 86_400_000, สัปดาห์: 604_800_000, เดือน: 2_592_000_000 };
    return nowMs - Number(relative[1]) * unitMs[relative[2]];
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const year = christianYear(iso[1]);
    return Date.UTC(year, Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0));
  }
  const slash = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slash) return Date.UTC(christianYear(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
  const thai = text.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})/u);
  if (thai && THAI_MONTH.has(thai[2])) return Date.UTC(christianYear(thai[3]), THAI_MONTH.get(thai[2]) - 1, Number(thai[1]));
  return null;
}

export function isDescendingLatest(values, now = new Date()) {
  const timestamps = (values ?? []).map((value) => parseProviderUpdatedAt(value, now)).filter(Number.isFinite);
  if (timestamps.length < 2) return false;
  return timestamps.every((value, index) => index === 0 || timestamps[index - 1] >= value);
}

async function readNativeSorts(page) {
  return page.locator('select').evaluateAll((selects) => selects.map((select, index) => ({
    index,
    options: [...select.options].map((option) => ({
      value: option.value,
      text: option.textContent || '',
      selected: option.selected,
    })),
  })));
}

async function visibleUpdateEvidence(page) {
  return page.locator('article.bg-resume').evaluateAll((cards) => cards.map((card) => {
    const explicit = card.querySelector('[datetime], [data-updated-at], [data-update-date], [data-last-update]');
    if (explicit) {
      return explicit.getAttribute('datetime')
        || explicit.getAttribute('data-updated-at')
        || explicit.getAttribute('data-update-date')
        || explicit.getAttribute('data-last-update')
        || explicit.textContent
        || '';
    }
    const text = card.textContent || '';
    const match = text.match(/(?:อัปเดต|อัพเดท|แก้ไข|ปรับปรุง)[^\n]{0,80}/u);
    return match?.[0] || '';
  }));
}

/** Ensure JobBKK results are explicitly newest-first; never silently trust site defaults. */
export async function ensureLatestUpdatedSort(page) {
  const option = findLatestSortOption(await readNativeSorts(page));
  if (option) {
    if (!option.selected) {
      await page.locator('select').nth(option.selectIndex).selectOption(option.value);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }
    const selected = findLatestSortOption(await readNativeSorts(page));
    if (selected?.selected) return { guaranteed: true, method: 'official_sort_control' };
  }

  const evidence = await visibleUpdateEvidence(page);
  if (isDescendingLatest(evidence)) return { guaranteed: true, method: 'verified_card_dates' };
  throw new Error('JobBKK ไม่พบหลักฐานว่าเรียง Resume อัปเดตล่าสุด — หยุดเพื่อไม่เปิดคนผิดลำดับ');
}
