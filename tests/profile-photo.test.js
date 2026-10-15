import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import {
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
