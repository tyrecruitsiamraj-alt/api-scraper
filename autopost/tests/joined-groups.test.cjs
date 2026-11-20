const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { joinedGroupToken, matchJoinedGroups } = require('../server/joined-groups');

test('ลิงก์หน้าแรกของกลุ่มเท่านั้น — เมนู ลิงก์โพสต์ ลิงก์โปรไฟล์ในกลุ่ม ไม่นับ', () => {
  assert.equal(joinedGroupToken('https://www.facebook.com/groups/1486494998623206/'), '1486494998623206');
  assert.equal(joinedGroupToken('/groups/HanganKhabrot/'), 'hangankhabrot');
  assert.equal(joinedGroupToken('https://www.facebook.com/groups/hangankhabrot'), 'hangankhabrot');
  assert.equal(joinedGroupToken('https://www.facebook.com/groups/joins/?nav_source=tab'), '');
  assert.equal(joinedGroupToken('https://www.facebook.com/groups/feed/'), '');
  assert.equal(joinedGroupToken('https://www.facebook.com/groups/123/posts/456/'), '');
  assert.equal(joinedGroupToken('https://www.facebook.com/groups/123/user/789/'), '');
  assert.equal(joinedGroupToken('https://evil.example.com/groups/123/'), '');
});

// 19 พ.ย. 2569: 120 กลุ่มเพิ่มด้วยเลขกลุ่ม ชื่อยังเป็น "Group <เลข>"
const GROUPS = [
  { fb_group_id: '1298753941570443', fb_slug: null, name: 'Group 1298753941570443' },
  { fb_group_id: '1486494998623206', fb_slug: null, name: 'หางานขับรถ ชลบุรี' },
  { fb_group_id: '645772637760283', fb_slug: 'rayongjobs', name: 'งานระยอง' },
  { fb_group_id: '770531713128542', fb_slug: null, name: 'งานขับรถ ศรีราชา' },
];

test('เทียบด้วยเลขกลุ่ม · slug ที่จำไว้ · ชื่อกลุ่ม (แล้วจำ slug ไว้)', () => {
  const m = matchJoinedGroups(
    [
      { token: '1298753941570443', name: 'งานขับรถ บ่อวิน' },
      { token: 'rayongjobs', name: 'งานระยอง' },
      { token: 'sriracha.driver', name: 'งานขับรถ  ศรีราชา' },
      { token: '999', name: 'กลุ่มที่ไม่อยู่ในระบบ' },
    ],
    GROUPS,
  );
  assert.deepEqual(m.memberIds.sort(), ['1298753941570443', '645772637760283', '770531713128542']);
  assert.deepEqual(m.nameUpdates, [{ fb_group_id: '1298753941570443', name: 'งานขับรถ บ่อวิน' }]);
  assert.deepEqual(m.slugUpdates, [{ fb_group_id: '770531713128542', slug: 'sriracha.driver' }]);
  assert.equal(m.unmatched, 1);
});

test('ชื่อ "Group <เลข>" และชื่อซ้ำสองกลุ่ม ใช้เทียบไม่ได้', () => {
  const twins = [
    { fb_group_id: '1', name: 'งานขับรถ' },
    { fb_group_id: '2', name: 'งานขับรถ' },
  ];
  assert.deepEqual(matchJoinedGroups([{ token: 'x', name: 'งานขับรถ' }], twins).memberIds, []);
  assert.deepEqual(matchJoinedGroups([{ token: 'y', name: 'Group 1298753941570443' }], GROUPS).memberIds, []);
});

test('บันทึกรายชื่อ: อ่านไม่ได้ไม่เขียน · ที่ขอเข้าไว้ไม่ทับเป็นไม่ได้เข้า · ไม่กดซ้ำใน 7 วัน', () => {
  const db = fs.readFileSync(require.resolve('../server/db.js'), 'utf8');
  const save = db.slice(db.indexOf('async function saveJoinedGroupsList'), db.indexOf('async function saveGroupSlug'));
  assert.match(save, /if \(!userId \|\| list\.length === 0\) return null;/);
  assert.match(save, /AND NOT \(group_memberships\.state IN \('pending', 'questions'\)/);
  const pick = db.slice(db.indexOf('async function pickGroupsToJoin'), db.indexOf('async function enqueueDailyGroupCheckJobs'));
  assert.match(pick, /gm\.join_tried_at < NOW\(\) - INTERVAL '7 days'/);
  assert.match(db, /COALESCE\(q\.mode, 'post'\) = 'groupcheck' AND \$4::jsonb \? 'groupcheck'/);
  const spec = fs.readFileSync(require.resolve('./facebookGroupCheck.spec.ts'), 'utf8');
  // อ่านรายชื่อไม่ได้ = ไม่กดเข้าร่วม (กันกดกลุ่มที่เป็นสมาชิกอยู่แล้ว)
  assert.match(spec, /if \(!entries\.length\) \{[\s\S]*?return;\n  \}/);
  assert.match(spec, /level: 'info'/);
  assert.doesNotMatch(spec, /level: 'success'/);
});

// 20 พ.ย. 2569: รอบเช็กกลุ่ม 12 รอบไม่เคยกดเข้าร่วม — เห็นช่องเขียนโพสต์ = ตีว่าเป็นสมาชิก ทั้งที่กลุ่มสาธารณะโพสต์ได้โดยไม่ต้องเข้า
test('ช่องเขียนโพสต์อย่างเดียวไม่พอ ต้องไม่มีปุ่มเข้าร่วมที่หัวกลุ่ม · รอบเช็กกลุ่มกดเข้าร่วม รอบโพสต์ไม่กด', () => {
  const src = fs.readFileSync(require.resolve('../src/helpers/groupMembership.ts'), 'utf8');
  assert.match(src, /if \(canPost && !join\) return 'member';\n\s+if \(canPost && !opts\.joinWhenVisitor\) return 'visitor';/);
  assert.match(src, /if \(top < 900\) return btn;/, 'ปุ่มเข้าร่วมของกลุ่มแนะนำในฟีดไม่นับ');
  assert.match(src, /return stillJoin \? 'visitor' : 'joined';/);
  const check = fs.readFileSync(require.resolve('./facebookGroupCheck.spec.ts'), 'utf8');
  assert.match(check, /ensureGroupMembership\(activePage, budget, String\(label\), \{ joinWhenVisitor: true \}\)/);
  const post = fs.readFileSync(require.resolve('../src/helpers/postToGroup.ts'), 'utf8');
  assert.match(post, /ensureGroupMembership\(page, options\.joinBudget, userLabel\);/);
  assert.match(post, /if \(!canPost && state !== 'joined'\) return false;/, 'โพสต์ได้โดยไม่ต้องเข้า = โพสต์ต่อ');
  const db = fs.readFileSync(require.resolve('../server/db.js'), 'utf8');
  assert.match(db, /gm\.state IN \('not_member', 'visitor', 'unknown'\)/);
  assert.match(db, /WHERE group_memberships\.state <> 'visitor'/);
});
