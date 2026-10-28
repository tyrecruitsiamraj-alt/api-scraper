/**
 * จัดกลุ่มผู้สมัครที่เป็นคนเดียวกัน (เจอจากหลายเว็บ/หลายรอบแต่ระบบเก็บเป็นคนละแถว) — ใช้แสดงผลบนหน้าเว็บ ไม่แก้ข้อมูล
 *
 * ถือว่าคนเดียวกันเมื่อ:
 *   - เบอร์โทร 9 หลักท้ายตรงกัน (0812345678 กับ +66812345678 = เบอร์เดียวกัน) หรือ
 *   - อีเมลตรงกัน
 * ค่าที่ซ้ำกันเกิน maxShared แถวถือว่าไม่ใช่ของผู้สมัคร (เช่นเบอร์ call center ของเว็บ อีเมลตัวอย่าง) — ไม่ใช้จับคู่
 * ชื่อซ้ำอย่างเดียวไม่นับ (คนชื่อซ้ำกันมีจริง)
 * แถวหลักของกลุ่ม = แถวที่อัปเดตล่าสุด
 */

export function phoneKey(phoneNorm) {
  const d = String(phoneNorm ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

export function emailKey(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)) return '';
  if (/@example\.(com|org|net)$/.test(e)) return '';
  return e;
}

/**
 * @param {{ id: string; phone_norm?: string | null; email_norm?: string | null; last_updated_at?: string | Date | null }[]} rows
 * @param {number} [maxShared]
 * @returns {{ leaderOf: Map<string, string>; membersOf: Map<string, string[]>; hiddenIds: string[] }}
 */
export function groupDuplicateCandidates(rows, maxShared = 5) {
  const keysOf = new Map();
  const count = new Map();
  for (const r of rows) {
    const keys = [phoneKey(r.phone_norm), emailKey(r.email_norm)]
      .map((k, i) => (k ? `${i === 0 ? 'p' : 'e'}:${k}` : ''))
      .filter(Boolean);
    keysOf.set(r.id, keys);
    for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  }

  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(x) !== root) {
      const next = parent.get(x);
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const firstByKey = new Map();
  for (const r of rows) {
    for (const k of keysOf.get(r.id)) {
      if ((count.get(k) ?? 0) > maxShared) continue;
      const other = firstByKey.get(k);
      if (other === undefined) firstByKey.set(k, r.id);
      else parent.set(find(r.id), find(other));
    }
  }

  const ts = (v) => (v ? new Date(v).getTime() || 0 : 0);
  const groups = new Map();
  for (const r of rows) {
    const root = find(r.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r);
  }

  const leaderOf = new Map();
  const membersOf = new Map();
  const hiddenIds = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => ts(b.last_updated_at) - ts(a.last_updated_at) || String(a.id).localeCompare(String(b.id)));
    const leader = members[0].id;
    membersOf.set(leader, members.map((m) => m.id));
    for (const m of members) {
      leaderOf.set(m.id, leader);
      if (m.id !== leader) hiddenIds.push(m.id);
    }
  }
  return { leaderOf, membersOf, hiddenIds };
}
