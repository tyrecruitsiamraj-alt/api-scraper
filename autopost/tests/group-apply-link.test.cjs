const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGroupLinks, captionForGroup, groupLinkIssues } = require('../server/group-apply-link');

// หน้าตาเหมือนใบสั่งจริงจาก Jarvis (job_snapshot ของ job_posting_requests, 2 พ.ย. 2569)
const ORIGINAL = 'https://jarvis.siamrajathanee.dev/apply/p/kbfp6xm';
const GROUP_LINKS = [
  { group_id: 'mvhmloovlppmpi5o6fg', link_code: 'k3f9x2a', apply_link: 'https://jarvis.siamrajathanee.dev/apply/p/k3f9x2a' },
  { group_id: 'mvhmlowwseq4bvkqq4', link_code: 'q7m2z8d', apply_link: 'https://jarvis.siamrajathanee.dev/apply/p/q7m2z8d' },
  { group_id: 'mvhmlp0a1b2c3d4e5f', link_code: 'z1y2x3w', apply_link: 'https://jarvis.siamrajathanee.dev/apply/p/z1y2x3w' },
];
const CAPTION = [
  '📢 รับสมัคร พนักงานขับรถผู้บริหาร ประจำสาทร',
  'รายได้ 18,000–22,000 บาท มีโอที',
  '',
  `👉 สมัครงานได้ที่: ${ORIGINAL}`,
  'หรือโทร 02-xxx-xxxx',
].join('\n');
const job = { caption: CAPTION, apply_link: ORIGINAL, group_links: GROUP_LINKS };

test('ใบสั่ง 3 กลุ่ม → แต่ละกลุ่มได้ลิงก์ของตัวเอง ไม่ซ้ำกัน ส่วนอื่นเหมือนกันทุกตัวอักษร', () => {
  const results = GROUP_LINKS.map((g) => captionForGroup(job, g.group_id));
  const links = results.map((r) => r.apply_link);
  assert.deepEqual(links, GROUP_LINKS.map((g) => g.apply_link));
  assert.equal(new Set(links).size, 3);
  for (const [i, r] of results.entries()) {
    assert.equal(r.replaced, true);
    assert.ok(r.caption.includes(GROUP_LINKS[i].apply_link));
    assert.ok(!r.caption.includes(ORIGINAL));
    // ถอดลิงก์ออกแล้วข้อความต้องเหมือนต้นฉบับทุกตัวอักษร
    assert.equal(r.caption.split(GROUP_LINKS[i].apply_link).join(ORIGINAL), CAPTION);
  }
});

test('ใบสั่งเก่าที่ไม่มี group_links → ข้อความเดิม ลิงก์เดิม ทุกกลุ่ม', () => {
  const old = { caption: CAPTION, apply_link: ORIGINAL, group_links: null };
  assert.deepEqual(captionForGroup(old, 'mvhmloovlppmpi5o6fg'), { caption: CAPTION, apply_link: ORIGINAL, replaced: false });
  const older = { caption: CAPTION, apply_link: null, group_links: undefined };
  assert.deepEqual(captionForGroup(older, 'mvhmloovlppmpi5o6fg'), { caption: CAPTION, apply_link: null, replaced: false });
});

test('กลุ่มที่ไม่อยู่ใน group_links → ลิงก์เดิม', () => {
  const r = captionForGroup(job, 'mvhmlzzzzzznotlisted');
  assert.deepEqual(r, { caption: CAPTION, apply_link: ORIGINAL, replaced: false });
});

test('ข้อความที่คนแก้ใน So Scraping แล้ว (ยังมีลิงก์เดิมอยู่) ก็ได้ลิงก์ของกลุ่มถูกต้อง · แทนทุกจุดที่เจอ', () => {
  const edited = `${CAPTION}\n\nด่วน! กดสมัครเลย ${ORIGINAL}`;
  const r = captionForGroup({ ...job, caption: edited }, 'mvhmlowwseq4bvkqq4');
  const groupLink = 'https://jarvis.siamrajathanee.dev/apply/p/q7m2z8d';
  assert.equal(r.replaced, true);
  assert.equal(r.caption.split(groupLink).length - 1, 2);
  assert.ok(!r.caption.includes(ORIGINAL));
  assert.equal(r.caption.split(groupLink).join(ORIGINAL), edited);
});

test('group_links มาเป็นข้อความ JSON (jsonb อ่านเป็น string) ก็อ่านได้ · ทิ้งรายการที่ลิงก์ไม่ใช่ http', () => {
  const parsed = parseGroupLinks(JSON.stringify([...GROUP_LINKS, { group_id: 'x', apply_link: 'javascript:alert(1)' }, { apply_link: ORIGINAL }]));
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0], GROUP_LINKS[0]);
  assert.deepEqual(parseGroupLinks('ไม่ใช่ json'), []);
  assert.deepEqual(parseGroupLinks({ group_id: 'x' }), []);
});

test('ตัวตรวจก่อนโพสต์: ลิงก์แยกกลุ่มครบ = ไม่มีปัญหา · ไม่มี group_links = ไม่ยุ่ง', () => {
  assert.deepEqual(groupLinkIssues(CAPTION, ORIGINAL, GROUP_LINKS), []);
  assert.deepEqual(groupLinkIssues('ไม่มีลิงก์เลย โทร 081-234-5678', null, []), []);
});

test('ตัวตรวจก่อนโพสต์: แก้ข้อความจนลิงก์เดิมหาย → บอกว่าใส่ลิงก์กลับ · Jarvis ไม่ส่ง apply_link เดิม → ให้สั่งใหม่', () => {
  const noLink = groupLinkIssues('รับสมัครพนักงานขับรถ โทร 081-234-5678', ORIGINAL, GROUP_LINKS);
  assert.equal(noLink.length, 1);
  assert.ok(noLink[0].includes(ORIGINAL));
  assert.ok(noLink[0].includes('ใส่ลิงก์นี้กลับ'));
  const noOriginal = groupLinkIssues(CAPTION, null, GROUP_LINKS);
  assert.equal(noOriginal.length, 1);
  assert.ok(noOriginal[0].includes('สั่งใบนี้ใหม่'));
});
