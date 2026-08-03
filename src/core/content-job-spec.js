/**
 * Resolve the real job identity used by Content Orchestrator.
 *
 * A work site is never job evidence. Only explicit position/task/department
 * fields are considered, so "โรงพยาบาล" cannot accidentally become
 * "พนักงานโรงพยาบาล" when the requisition is actually for a driver.
 */

const FAMILY_LABELS = {
  A: '🎭 Presentation-Forward',
  B: '🔧 Technical-Skilled',
  C: '🚗 Transport/Driver',
  D: '📋 Service-Operational',
  E: '🛡️ Security/Control',
  F: '🌳 Field/Outdoor Labor',
};

const GENERIC_POSITION_RE = /^(?:พนักงาน|เจ้าหน้าที่|ลูกจ้าง|บุคลากร|พนักงานทั่วไป|เจ้าหน้าที่ทั่วไป|staff|worker|employee|general staff|งาน|ตำแหน่ง)$/iu;
const REQUEST_NO_RE = /^opl[\s-]*\d+$/iu;

const FAMILY_RULES = [
  {
    family: 'C',
    re: /(?:\bdriver\b|พนักงานขับรถ|คนขับรถ|ขับรถ|โชเฟอร์|chauffeur|valet|บริการจอดรถ)/iu,
    canonical: (text) => {
      if (/(?:valet|บริการจอดรถ)/iu.test(text)) return 'พนักงานบริการจอดรถ (Valet)';
      if (/(?:ผู้บริหาร|executive)/iu.test(text)) return 'พนักงานขับรถผู้บริหาร';
      if (/(?:ส่วนกลาง|pool car)/iu.test(text)) return 'พนักงานขับรถส่วนกลาง';
      return 'พนักงานขับรถ';
    },
  },
  {
    family: 'A',
    re: /(?:\bpr\b|public relations|ประชาสัมพันธ์|ลูกค้าสัมพันธ์|ต้อนรับ|reception(?:ist)?|guest relations|\bgro\b|concierge|brand ambassador|พิธีกร|\bmc\b)/iu,
    canonical: (text) => {
      if (/(?:ต้อนรับ|reception(?:ist)?|guest relations|\bgro\b|concierge)/iu.test(text)) return 'พนักงานต้อนรับ';
      return 'พนักงานประชาสัมพันธ์';
    },
  },
  {
    family: 'E',
    re: /(?:รปภ|รักษาความปลอดภัย|security guard|security officer)/iu,
    canonical: () => 'พนักงานรักษาความปลอดภัย',
  },
  {
    family: 'F',
    re: /(?:คนสวน|รุกขกร|ดูแลสวน|ภูมิทัศน์|landscap|gardener|arborist)/iu,
    canonical: (text) => (/(?:รุกขกร|arborist)/iu.test(text) ? 'รุกขกร' : 'พนักงานดูแลสวน'),
  },
  {
    family: 'B',
    re: /(?:ช่าง|technician|engineer|วิศวกร|programmer|developer|โปรแกรมเมอร์|it support|helpdesk|network|server|cloud|ไฟฟ้า|เครื่องกล|ซ่อมบำรุง)/iu,
    canonical: (text) => {
      if (/(?:programmer|developer|โปรแกรมเมอร์)/iu.test(text)) return 'โปรแกรมเมอร์';
      if (/(?:it support|helpdesk)/iu.test(text)) return 'เจ้าหน้าที่ IT Support';
      if (/(?:ไฟฟ้า)/iu.test(text)) return 'ช่างไฟฟ้า';
      if (/(?:อาคาร|building|mep)/iu.test(text)) return 'ช่างอาคาร';
      return 'ช่างเทคนิค';
    },
  },
  {
    family: 'D',
    re: /(?:ธุรการ|\badmin\b|แคชเชียร์|cashier|คลังสินค้า|warehouse|สโตร์|storekeeper|แม่บ้าน|ทำความสะอาด|housekeep|cleaner|แพ็คสินค้า|จัดส่ง)/iu,
    canonical: (text) => {
      if (/(?:แคชเชียร์|cashier)/iu.test(text)) return 'พนักงานแคชเชียร์';
      if (/(?:คลังสินค้า|warehouse|สโตร์|storekeeper|แพ็คสินค้า|จัดส่ง)/iu.test(text)) return 'พนักงานคลังสินค้า';
      if (/(?:แม่บ้าน|ทำความสะอาด|housekeep|cleaner)/iu.test(text)) return 'พนักงานทำความสะอาด';
      return 'พนักงานธุรการ';
    },
  },
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function isGenericPosition(value) {
  const text = clean(value);
  return !text || GENERIC_POSITION_RE.test(text) || REQUEST_NO_RE.test(text);
}

export function classifyJobFamily(text) {
  const value = clean(text);
  if (!value) return null;
  const rule = FAMILY_RULES.find((item) => item.re.test(value));
  return rule
    ? { family: rule.family, familyLabel: FAMILY_LABELS[rule.family], canonicalPosition: rule.canonical(value) }
    : null;
}

/**
 * @param {{title?:string, positions?:string, snapshot?:Record<string,any>}} input
 * @returns {{position:string|null, family:string|null, familyLabel:string|null,
 *   source:string|null, confidence:'explicit'|'derived'|'unknown', needsConfirmation:boolean}}
 */
export function resolveContentJobSpec(input = {}) {
  const snap = input.snapshot ?? {};
  const explicit = [
    ['positions', input.positions],
    ['title', input.title],
    ['snapshot.position', snap.position],
    ['snapshot.request_name', snap.request_name],
    ['snapshot.job_title', snap.job_title],
    ['snapshot.job_description_name', snap.job_description_name],
    ['snapshot.staff_title_name', snap.staff_title_name],
    ['snapshot.job_type', snap.job_type],
  ];

  for (const [source, raw] of explicit) {
    const value = clean(raw);
    if (isGenericPosition(value)) continue;
    const classified = classifyJobFamily(value);
    return {
      position: value,
      family: classified?.family ?? null,
      familyLabel: classified?.familyLabel ?? null,
      source,
      confidence: 'explicit',
      needsConfirmation: false,
    };
  }

  // Strong task/department evidence only. Deliberately excludes site_name,
  // location, work_addr and unit_name because a workplace is not a job role.
  const evidence = [
    ['snapshot.department', snap.department],
    ['snapshot.department_code', snap.department_code],
    ['snapshot.job_description_code_1', snap.job_description_code_1],
    ['snapshot.role', snap.role],
    ['snapshot.duties', snap.duties],
    ['snapshot.job_description', snap.job_description],
    ['snapshot.scope_of_work', snap.scope_of_work],
    ['snapshot.detail_position', snap.detail_position],
  ];

  for (const [source, raw] of evidence) {
    const value = clean(raw);
    const classified = classifyJobFamily(value);
    if (!classified) continue;
    return {
      position: classified.canonicalPosition,
      family: classified.family,
      familyLabel: classified.familyLabel,
      source,
      confidence: 'derived',
      needsConfirmation: false,
    };
  }

  return {
    position: null,
    family: null,
    familyLabel: null,
    source: null,
    confidence: 'unknown',
    needsConfirmation: true,
  };
}

export function jobFamilyLabel(family) {
  return FAMILY_LABELS[family] ?? null;
}
