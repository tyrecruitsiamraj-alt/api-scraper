const test = require('node:test');
const assert = require('node:assert/strict');
const { groupSlugFromUrl, groupAliases, postIdForGroup, canonicalPostLink, applyPaths, postLinkVerdict, openedPostCheck } = require('../server/group-post-link');

const G = '1486494998623206';

test('slug from a group page URL', () => {
  assert.equal(groupSlugFromUrl('https://www.facebook.com/groups/HanganKhabrot/my_posted_content'), 'hangankhabrot');
  assert.equal(groupSlugFromUrl(`https://www.facebook.com/groups/${G}/`), G);
  assert.deepEqual(groupAliases(G, 'https://www.facebook.com/groups/hangankhabrot/my_posted_content'), [G, 'hangankhabrot']);
  assert.deepEqual(groupAliases(G, `https://www.facebook.com/groups/${G}/my_posted_content`), [G]);
});

test('post links by number, by name, permalink and story_fbid', () => {
  const al = [G, 'hangankhabrot'];
  assert.equal(postIdForGroup(`https://www.facebook.com/groups/${G}/posts/2172970066642359/`, al), '2172970066642359');
  assert.equal(postIdForGroup('/groups/hangankhabrot/posts/2172970066642359/?__cft__=x', al), '2172970066642359');
  assert.equal(postIdForGroup('https://www.facebook.com/groups/HanganKhabrot/permalink/555/', al), '555');
  assert.equal(postIdForGroup(`https://www.facebook.com/permalink.php?story_fbid=777&id=${G}`, al), '777');
});

test('not our group or not a post is rejected', () => {
  const al = [G, 'hangankhabrot'];
  assert.equal(postIdForGroup('https://www.facebook.com/groups/othergroup/posts/1/', al), null);
  assert.equal(postIdForGroup('https://www.facebook.com/groups/hangankhabrot/user/1000/', al), null);
  assert.equal(postIdForGroup('https://www.facebook.com/hangankhabrot', al), null);
});

test('stored link is always the numbered form', () => {
  assert.equal(
    canonicalPostLink('/groups/hangankhabrot/posts/2172970066642359/?x=1', G, [G, 'hangankhabrot']),
    `https://www.facebook.com/groups/${G}/posts/2172970066642359/`,
  );
});

// 17 พ.ย. 2569: หาโพสต์ใหม่ไม่เจอแล้วหยิบโพสต์บนสุด ได้ลิงก์โพสต์งานนายไทย 4 พ.ย. ให้ใบ สวก. OPL6911041
const SVK = 'รับสมัครพนักงานขับรถ (หน่วยงาน สวก.)\n📍 ขับรถส่วนกลาง\nหรือสมัครงานได้ที่: https://jarvis.siamrajathanee.dev/apply/p/a1b2c3d\n';
const NAITHAI_POST = 'Diermeier Debi · 4 พฤศจิกายน เวลา 22:16 น.\nรับสมัครพนักงานขับรถ นายไทย (หน่วยงาน หลักทรัพย์ภัทร)\nหรือสมัครงานได้ที่:https://jarvis.siamrajathanee.dev/apply/p/q8tbrxr\nยินดีตอบคำถามครับ';

test('post of another job (different apply link) is never ours', () => {
  assert.equal(postLinkVerdict(NAITHAI_POST, SVK), 'other');
});

test('post with this job apply link is ours — also when Facebook cuts the link with …', () => {
  assert.equal(postLinkVerdict('Diermeier Debi · 3 นาที\nhttps://jarvis.siamrajathanee.dev/apply/p/a1b2c3d', SVK), 'ours');
  assert.equal(postLinkVerdict('ดูได้ที่ jarvis.siamrajathanee.dev/apply/p/a1b2c…', SVK), 'ours');
  assert.equal(postLinkVerdict('https://jarvis.siamrajathanee.dev/apply/p/A1B2C3D/', SVK), 'ours');
});

test('cannot tell when post or announcement has no apply link', () => {
  assert.equal(postLinkVerdict('รับสมัครพนักงานขับรถ โทร 08x', SVK), 'unknown');
  assert.equal(postLinkVerdict(NAITHAI_POST, 'รับสมัครพนักงานขับรถ ไม่มีลิงก์'), 'unknown');
  assert.deepEqual([...applyPaths('a /apply/ b https://x.dev/apply/p/zz9/ c')], ['/apply/p/zz9']);
});

test('ตรวจลิงก์ย้อนหลัง: รอบเก็บคอมเมนต์เทียบลิงก์สมัคร · ของงานอื่น = ล้างลิงก์ ไม่เก็บคอมเมนต์ · หาใหม่ไม่หยิบโพสต์งานอื่น', () => {
  const fs = require('node:fs');
  const spec = fs.readFileSync(require.resolve('./collectComments.spec.ts'), 'utf8');
  // 18 พ.ย. 2569: กล่องแรกตัดสินได้ทั้งสองทาง · ทั้งหน้า (มีคอมเมนต์) ยืนยันได้แค่ "ของเรา" ห้ามใช้ล้างลิงก์
  assert.match(spec, /const first = groupPostLink\.postLinkVerdict\(read\.article, item\.own_apply_text\);/);
  assert.match(spec, /first === 'unknown' && groupPostLink\.postLinkVerdict\(read\.whole, item\.own_apply_text\) === 'ours' \? 'ours' : first/);
  assert.match(spec, /if \(verdict === 'other'\) \{/);
  // 17 พ.ย. 2569: ขยาย "ดูเพิ่มเติม" + อ่านลิงก์ในโพสต์ก่อนตัดสิน · ตัดสินไม่ได้ = จด link_unverified
  assert.match(spec, /const read = await readPostForVerdict\(active\);/);
  assert.match(spec, /apply_in_main/);
  assert.match(spec, /ดูเพิ่มเติม/);
  assert.match(spec, /l\.facebook\.com/);
  assert.match(spec, /kind: 'link_unverified'/);
  assert.match(spec, /clearWrongPostLink\(item\.post_log_id, item\.post_link\)/);
  assert.match(spec, /ownText: item\.own_apply_text/);
  const db = fs.readFileSync(require.resolve('../server/db.js'), 'utf8');
  assert.match(db, /SET post_link = NULL, post_status = 'ไม่พบลิงก์หลังโพสต์' WHERE id = \$1 AND post_link = \$2/);
  const find = fs.readFileSync(require.resolve('../src/helpers/saveToSheet.ts'), 'utf8');
  assert.match(find, /if \(verdict === 'other'\) continue;/);
});

// 20 พ.ย. 2569: ตัวตรวจลิงก์อ่านโพสต์คนอื่นในฟีด — ต้องรู้ว่าหน้าที่เปิดยังเป็นโพสต์เราไหม
test('หลังเปิดลิงก์โพสต์: ยังเป็นโพสต์เดิม / ถูกพาไปหน้ากลุ่ม / บอกไม่ได้', () => {
  const link = `https://www.facebook.com/groups/${G}/posts/2202160973723268/`;
  assert.equal(openedPostCheck(link, link, G), 'same');
  assert.equal(openedPostCheck('https://www.facebook.com/groups/hangankhabrot/posts/2202160973723268/?comment_id=1', link, G), 'same');
  assert.equal(openedPostCheck(`https://www.facebook.com/groups/${G}/permalink/2202160973723268/`, link, G), 'same');
  assert.equal(openedPostCheck(`https://www.facebook.com/groups/${G}/`, link, G), 'left');
  assert.equal(openedPostCheck('https://www.facebook.com/groups/hangankhabrot', link, G), 'left');
  assert.equal(openedPostCheck(`https://www.facebook.com/groups/${G}/posts/999/`, link, G), 'left');
  assert.equal(openedPostCheck(`https://www.facebook.com/groups/${G}/posts/pfbid02abc/`, link, G), 'unknown');
  assert.equal(openedPostCheck('https://www.facebook.com/login/?next=x', link, G), 'unknown');
  assert.equal(openedPostCheck(link, 'https://www.facebook.com/share/p/abc/', G), 'unknown');
});

test('ตัวตรวจลิงก์อ่านในหน้าต่างโพสต์ ไม่อ่านฟีดด้านหลัง · ถูกพาออกจากโพสต์ = ไม่เก็บยอดรอบนั้น', () => {
  const fs = require('node:fs');
  const spec = fs.readFileSync(require.resolve('./collectComments.spec.ts'), 'utf8');
  assert.match(spec, /const dialog = page\.locator\(POST_DIALOG\)\.first\(\);/);
  assert.match(spec, /const article = inDialog \? dialog : page\.locator\('\[role="main"\] \[role="article"\]'\)\.first\(\);/);
  assert.match(spec, /clone\.querySelectorAll\(commentSel\)\.forEach\(\(n\) => n\.remove\(\)\);/, 'ตัวโพสต์ = หน้าต่างตัดคอมเมนต์ออก');
  assert.match(spec, /openedPostCheck\(active\.url\(\), item\.post_link, item\.group_id\) === 'left'/);
  assert.match(spec, /kind: 'post_not_opened'[\s\S]{0,400}noCollectResult\.add\(item\.post_log_id\);\s+continue;/);
});
