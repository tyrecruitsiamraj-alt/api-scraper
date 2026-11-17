const test = require('node:test');
const assert = require('node:assert/strict');
const { jarvisImageUrl, postModeIssue, imageRefFor, isImageOnly } = require('../server/jarvis-post-image');

// รูปแนบโพสต์จาก Jarvis (17 พ.ย. 2569) — รับเฉพาะลิงก์ https ของ Jarvis · ไม่มีรูป = ไม่โพสต์
const ID = '3f6c1a52-8d4e-4b7a-9c21-5e0f7b9d2a10';
const OK = `https://jarvis.siamrajathanee.dev/api/public/post-image?id=${ID}`;

test('รับเฉพาะลิงก์รูปของ Jarvis', () => {
  assert.equal(jarvisImageUrl(OK), OK);
  assert.equal(jarvisImageUrl(OK.replace('https:', 'http:')), null);
  assert.equal(jarvisImageUrl(`https://evil.example.com/api/public/post-image?id=${ID}`), null);
  assert.equal(jarvisImageUrl('https://jarvis.siamrajathanee.dev/api/public/post-image?id=../x'), null);
  assert.equal(jarvisImageUrl('https://jarvis.siamrajathanee.dev/other?id=' + ID), null);
  assert.equal(jarvisImageUrl(null), null);
  assert.equal(jarvisImageUrl(`https://test.jarvis.dev/api/public/post-image?id=${ID}`, { JARVIS_IMAGE_HOSTS: 'test.jarvis.dev' }), `https://test.jarvis.dev/api/public/post-image?id=${ID}`);
});

test('แบบโพสต์: ข้อความล้วนผ่าน · มีรูปต้องแนบรูป', () => {
  assert.equal(postModeIssue('caption_only', null), null);
  assert.equal(postModeIssue(undefined, null), null);
  assert.equal(postModeIssue('caption_image', OK), null);
  assert.match(postModeIssue('caption_image', null), /ยังไม่ได้แนบรูป/);
  assert.equal(postModeIssue('image_only', OK), null);
  assert.match(postModeIssue('image_only', null), /ยังไม่ได้แนบรูป/);
  assert.match(postModeIssue('weird', OK), /ไม่รู้จัก/);
});

test('image_ref เก็บเฉพาะแบบที่มีรูป · รูปอย่างเดียวไม่มีข้อความ', () => {
  assert.equal(imageRefFor('caption_image', OK), OK);
  assert.equal(imageRefFor('image_only', OK), OK);
  assert.equal(imageRefFor('caption_only', OK), null);
  assert.equal(isImageOnly('image_only'), true);
  assert.equal(isImageOnly('caption_image'), false);
});
