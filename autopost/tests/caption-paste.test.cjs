const test = require('node:test');
const assert = require('node:assert/strict');
const { pastedMatches, isCaptionPasteEnabled } = require('../server/caption-paste');

const caption = 'รับสมัครพนักงานขับรถ (หน่วยงาน SO)\n💵 รายได้ 500-700 บาท/วัน\n📞 โทร 081-234-5678';

test('วางแล้วตรงประกาศ: Facebook จัดบรรทัดใหม่ก็ยังนับว่าตรง', () => {
  assert.equal(pastedMatches(caption, caption), true);
  assert.equal(pastedMatches(caption.replace(/\n/g, '\n\n'), caption), true);
});

test('วางผิด: ข้อความของบัญชีอื่นที่แย่งคลิปบอร์ด / วางไม่ครบ / วางซ้ำสองรอบ', () => {
  assert.equal(pastedMatches('รับสมัครแม่บ้าน ประจำอาคาร โทร 089-999-9999', caption), false);
  assert.equal(pastedMatches(caption.slice(0, 20), caption), false);
  assert.equal(pastedMatches(caption + caption, caption), false);
  assert.equal(pastedMatches('', caption), false);
});

test('ปิดการวางได้ด้วย POST_CAPTION_PASTE=0', () => {
  assert.equal(isCaptionPasteEnabled({}), true);
  assert.equal(isCaptionPasteEnabled({ POST_CAPTION_PASTE: '0' }), false);
});
