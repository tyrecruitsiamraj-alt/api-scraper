import { test } from './humanBrowser.fixture';
import { facebookLogin, loadDynamicConfig } from '../src/helpers';

test('Facebook preflight: ตรวจบัญชีและกลุ่มโดยไม่โพสต์', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000);
  const userId = String(process.env.PREFLIGHT_USER_ID || '').trim();
  if (!userId) throw new Error('งานตรวจความพร้อมไม่มี PREFLIGHT_USER_ID');

  const config = await loadDynamicConfig();
  const user = config.users.find((item) => String(item.id) === userId);
  if (!user) throw new Error(`ไม่พบบัญชี Facebook ${userId}`);
  if (!user.email || !user.password) throw new Error('บัญชี Facebook ยังไม่มี Email/Password บนเครื่องที่ผูกไว้');
  const groupIds = Array.isArray(user.group_ids) ? user.group_ids.map(String) : [];
  const target = config.groups.find((group) => groupIds.includes(String(group.id)));
  if (!target?.fb_group_id) throw new Error('บัญชี Facebook ยังไม่ได้เลือกกลุ่มปลายทาง');

  const activePage = await facebookLogin(page, user.email, user.password, {
    userLabel: user.name || user.id,
    sessionKey: String(user.env_key || user.id || user.email || 'default'),
    checkpointWaitMinutes: 2,
  });
  await activePage.goto(`https://www.facebook.com/groups/${target.fb_group_id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  const url = activePage.url();
  if (/login|checkpoint|noLogIn|recover|verification/i.test(url)) {
    throw new Error(`บัญชียังเข้า Facebook Group ไม่ได้ (${url})`);
  }
  console.log(`Facebook preflight ผ่าน: ${user.name || user.id} → ${target.fb_group_id} (ไม่มีการโพสต์)`);
});
