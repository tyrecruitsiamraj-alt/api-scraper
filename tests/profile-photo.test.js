import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import {
  isPlaceholderPhotoHash,
  isRejectedProfileUrl,
  pickCurrentProfileAsset,
  pickJobbkkProfileImageUrl,
} from '../src/core/profile-photo.js';

test('isRejectedProfileUrl blocks JobBKK default avatars and chrome', () => {
  assert.equal(isRejectedProfileUrl('https://www.jobbkk.com/img/profile.jpg'), true);
  assert.equal(isRejectedProfileUrl('/images/default-profile.png'), true);
  assert.equal(isRejectedProfileUrl('data:image/png;base64,aaa'), true);
  assert.equal(isRejectedProfileUrl('https://cdn.jobbkk.com/resume/face/abc123.jpg'), false);
});

test('pickJobbkkProfileImageUrl ignores .main-name chrome images', () => {
  const $ = cheerio.load(`
    <div class="main-name"><img src="/img/logo.png" /></div>
    <div class="pic-profile"><img src="https://cdn.jobbkk.com/resume/real-face.jpg" /></div>
  `);
  assert.equal(pickJobbkkProfileImageUrl($), 'https://cdn.jobbkk.com/resume/real-face.jpg');
});

test('pickJobbkkProfileImageUrl returns empty for placeholder-only pages', () => {
  const $ = cheerio.load(`
    <div class="pic-profile"><img src="https://www.jobbkk.com/img/profile.jpg" /></div>
    <div class="main-name"><img src="/img/banner.png" /></div>
  `);
  assert.equal(pickJobbkkProfileImageUrl($), '');
});

test('pickCurrentProfileAsset prefers newest successful profile', () => {
  const picked = pickCurrentProfileAsset([
    { id: 'old', kind: 'profile', download_status: 'success', created_at: '2026-01-01T00:00:00Z' },
    { id: 'new', kind: 'profile', download_status: 'success', created_at: '2026-10-01T00:00:00Z' },
    { id: 'dead', kind: 'profile', download_status: 'superseded', created_at: '2026-11-01T00:00:00Z' },
    { id: 'att', kind: 'attachment', download_status: 'success', created_at: '2026-12-01T00:00:00Z' },
  ]);
  assert.equal(picked.id, 'new');
});

// ลิงก์จริงจากฐาน 17 พ.ย. 2569 (รูปแทนของเว็บที่เคยถูกเก็บเป็นรูปผู้สมัคร)
test('ไม่รับรูปในโฟลเดอร์ธีม JobBKK: รูปสมาชิกตัวอย่าง เงาคน และรูปปกปิด ทั้งลิงก์ตรงและห่อ _next/image', () => {
  for (const url of [
    'https://www.jobbkk.com/assets/template/jobbkk/theme02/images/mem_prof_pic.jpg',
    'https://www.jobbkk.com/assets/template/jobbkk/theme04/images/resume/protected_th_women.jpg',
    'https://www.jobbkk.com/_next/image?url=https%3A%2F%2Fstore.jobbkk.com%2Fassets%2Ftemplate%2Fjobbkk%2Ftheme02%2Fimages%2Fdefault_user.png%3Fv%3D0.06&w=3840&q=75',
    'https://www.jobbkk.com/_next/image?url=%2Fimages%2Fresume%2Fprotected_th_men.jpg&w=3840&q=75',
  ]) assert.equal(isRejectedProfileUrl(url), true, url);
  assert.equal(
    isRejectedProfileUrl('https://www.jobbkk.com/_next/image?url=https%3A%2F%2Fstore.jobbkk.com%2Fupload%2Fjobseeker%2F03%2F753%2F1EBC753%2Fimages%2Fface.jpg&w=3840&q=75'),
    false,
  );
});

test('รูปเงาคน/ปกปิดของ JobThai รู้จากไบต์ ไม่ใช่ลิงก์', () => {
  assert.equal(isPlaceholderPhotoHash('7350A994AFBE0BD7F780A7FB2C5D938A7E8A8F8B987F774A2B88AFE6ADE3B132'), true);
  assert.equal(isPlaceholderPhotoHash('9d7d318164bbf45e1d9bf920c93aa998449349e6b0262712e565fc2de4d3aebf'), true);
  assert.equal(isPlaceholderPhotoHash('0'.repeat(64)), false);
  assert.equal(isPlaceholderPhotoHash(''), false);
});

test('หน้า JobBKK ใหม่ที่ไม่มีคลาสรูป: หยิบเฉพาะรูปจากที่เก็บรูปผู้สมัคร ไม่หยิบไอคอนหรือรูปปกปิด', () => {
  const face = '/_next/image?url=https%3A%2F%2Fstore.jobbkk.com%2Fupload%2Fjobseeker%2F08%2FA78%2F1EE0A78%2Fimages%2Fp.jpg&w=3840&q=75';
  const $ = cheerio.load(`
    <div class="resume-card"><img src="/svg/resume_premium/skill-resume-20-1.png"><span>หญิง</span></div>
    <img src="https://www.facebook.com/tr?id=1&ev=PageView">
    <div class="rounded-full"><img alt="" srcset="${face} 1x, ${face} 2x" src="${face}"></div>
  `);
  assert.equal(pickJobbkkProfileImageUrl($), face);
  const hidden = cheerio.load(`
    <div class="resume-card"><img src="/svg/resume_premium/skill-resume-20-1.png"><span>ชาย</span></div>
    <div class="rounded-full"><img src="/_next/image?url=%2Fimages%2Fresume%2Fprotected_th_men.jpg&w=3840&q=75"></div>
  `);
  assert.equal(pickJobbkkProfileImageUrl(hidden), '');
});
