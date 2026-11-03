import { test, expect, type Page } from '@playwright/test';
import { getAuthState } from '../src/helpers/facebookLogin';

/**
 * 3 พ.ย. 2569: ฟีดขึ้นอยู่ตรงหน้า (กล่อง "คุณคิดอะไรอยู่ Moody") แต่บอทอ่านแค่ 1,200 ตัวอักษรแรกของหน้า
 * ซึ่งเป็นเมนูซ้าย + "ทางลัดของคุณ" ที่มีชื่องานยาว ๆ เลยไม่เห็นกล่องโพสต์ แล้วนั่งรอ "ยืนยันตัวตน" 5 นาทีจนล้ม
 * และพักบัญชีผิด ๆ — เทสต์นี้จำลองหน้าจริง (ไม่ต่อเน็ต) ว่าต้องตัดสินเป็น logged_in
 */
const SIDEBAR = [
  'Moody Keyanna', 'Meta AI', 'เพื่อน', 'ความทรงจำ', 'ที่บันทึกไว้', 'กลุ่ม', 'Reels', 'Marketplace', 'ดูเพิ่มเติม', 'ทางลัดของคุณ',
  ...Array.from({ length: 12 }, (_, i) => `หางาน พนักงานขับรถ ขับรถส่งของ ขับรถส่งอาหาร ขับรถผู้บริหาร ส่วนกลาง กรุงเทพฯ และปริมณฑล กลุ่มที่ ${i + 1}`),
].join('\n');

function feedHtml({ composer = true, articles = true } = {}) {
  return `<!doctype html><html><body>
    <nav><pre>${SIDEBAR}</pre></nav>
    <main>
      ${composer ? '<div role="button">คุณคิดอะไรอยู่ Moody</div>' : ''}
      ${articles ? '<div role="feed"><div role="article">Live หนุ่ม กรรชัย กำลังถ่ายทอดสด</div></div>' : '<div>Live หนุ่ม กรรชัย กำลังถ่ายทอดสด</div>'}
      <aside>คำขอเป็นเพื่อน <button>ยืนยัน</button> <button>ลบ</button></aside>
    </main>
  </body></html>`;
}

async function serve(page: Page, html: string) {
  await page.route('https://www.facebook.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
}

test('composer after a long sidebar, with no feed article drawn yet, is logged_in', async ({ page }) => {
  await serve(page, feedHtml({ articles: false }));
  await page.goto('https://www.facebook.com/');
  expect(SIDEBAR.length).toBeGreaterThan(1200);
  expect(await getAuthState(page)).toBe('logged_in');
});

test('feed articles without a composer are still logged_in', async ({ page }) => {
  await serve(page, feedHtml({ composer: false }));
  await page.goto('https://www.facebook.com/');
  expect(await getAuthState(page)).toBe('logged_in');
});

test('checkpoint URL stays checkpoint even when the page shows a composer', async ({ page }) => {
  await serve(page, feedHtml());
  await page.goto('https://www.facebook.com/checkpoint/1501092823525282/');
  expect(await getAuthState(page)).toBe('checkpoint');
});

test('identity-verification page without a feed is checkpoint', async ({ page }) => {
  await serve(page, '<!doctype html><html><body><h1>ยืนยันตัวตนของคุณ</h1><p>ส่งรหัสไปที่อีเมล</p></body></html>');
  await page.goto('https://www.facebook.com/');
  expect(await getAuthState(page)).toBe('checkpoint');
});

test('bare home page with nothing recognisable is unknown', async ({ page }) => {
  await serve(page, '<!doctype html><html><body><p>กำลังโหลด</p></body></html>');
  await page.goto('https://www.facebook.com/');
  expect(await getAuthState(page)).toBe('unknown');
});
