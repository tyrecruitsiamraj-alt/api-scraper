function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * SCRAPE_PREFERRED_WORKER may pin either one runner slot (scraper-1) or the
 * physical machine (SONB-RM009).  A pool exposes each slot as a separate
 * worker name, so machine pins must be resolved through heartbeat metadata.
 */
export function selectPreferredScrapeWorker(workers = [], configuredWorker = '') {
  const ready = Array.isArray(workers) ? workers : [];
  const configured = normalized(configuredWorker);
  if (!configured) return ready[0]?.name ?? null;

  const match = ready.find((worker) => (
    normalized(worker?.name) === configured
    || normalized(worker?.meta?.machine_name) === configured
  ));
  return match?.name ?? null;
}

const PLAIN_SLOT = /^scraper-\d+$/i;

/** ชื่อเครื่องแบบสั้น ใช้นำหน้าชื่อ slot (ตัด .local ของ Mac ออก) */
export function shortMachineName(hostname) {
  return String(hostname ?? '').trim().replace(/\.local$/i, '') || 'worker';
}

/**
 * ทุกเครื่องเคยตั้งชื่อ slot ว่า scraper-1, scraper-2 เหมือนกัน เปิดเครื่องที่สองแล้ว
 * heartbeat ทับกัน และงานที่ pin scraper-1 ไปวิ่งเครื่องไหนก็ได้.
 * เครื่องที่เป็นเจ้าของชื่อเดิมอยู่แล้ว (หรือยังไม่มีใครใช้) ใช้ชื่อเดิมต่อ
 * เครื่องอื่นเติมชื่อเครื่องตัวเองนำหน้า. ตั้ง SCRAPER_SLOT_PREFIX เองได้ถ้าต้องการ
 * @param {{ hostname: string, slots?: Array<{name?: string, machine_name?: string|null}>, explicit?: string }} input
 */
export function scraperSlotPrefix({ hostname, slots = [], explicit = '' }) {
  const set = String(explicit ?? '').trim();
  if (set) return set;
  const me = normalized(hostname);
  const ownedElsewhere = (Array.isArray(slots) ? slots : []).some((slot) => {
    const owner = normalized(slot?.machine_name);
    return PLAIN_SLOT.test(String(slot?.name ?? '')) && owner && owner !== me;
  });
  return ownedElsewhere ? shortMachineName(hostname) : '';
}

export function scraperSlotName(prefix, slot) {
  return prefix ? `${prefix}-scraper-${slot}` : `scraper-${slot}`;
}

/** ชื่อไฟล์ lock ต้องตรงกับที่ runner.js สร้าง (ตัดอักขระพิเศษแบบเดียวกัน) */
export function scraperSlotLockName(name) {
  return String(name || 'standalone').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'standalone';
}
