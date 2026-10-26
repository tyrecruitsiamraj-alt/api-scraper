import { test } from './humanBrowser.fixture';
import { facebookLogin, loadDynamicConfig } from '../src/helpers';
import { PLACEHOLDER_GROUP_NAME, readGroupName, rememberGroupName } from '../src/helpers/groupName';

/** เวลาต่อกลุ่มตอนอ่านชื่อ (เปิดหน้า + รอโหลด + พักแบบคน) */
const NAME_SCAN_MS_PER_GROUP = 12_000;
const NAME_SCAN_MAX_GROUPS = Math.max(0, Number(process.env.PREFLIGHT_NAME_SCAN_MAX) || 60);

test('Facebook preflight: ตรวจบัญชีและกลุ่มโดยไม่โพสต์', async ({ page }) => {
  const userId = String(process.env.PREFLIGHT_USER_ID || '').trim();
  if (!userId) throw new Error('งานตรวจความพร้อมไม่มี PREFLIGHT_USER_ID');

  const config = await loadDynamicConfig();
  const user = config.users.find((item) => String(item.id) === userId);
  if (!user) throw new Error(`ไม่พบบัญชี Facebook ${userId}`);
  if (!user.email || !user.password) throw new Error('บัญชี Facebook ยังไม่มี Email/Password บนเครื่องที่ผูกไว้');
  const groupIds = Array.isArray(user.group_ids) ? user.group_ids.map(String) : [];
  const userGroups = config.groups.filter((group) => groupIds.includes(String(group.id)) && group.fb_group_id);
  const target = userGroups[0];
  if (!target?.fb_group_id) throw new Error('บัญชี Facebook ยังไม่ได้เลือกกลุ่มปลายทาง');
  // กลุ่มที่ยังไม่มีชื่อจริง — เข้าไปอ่านชื่อทีละกลุ่มหลังตรวจผ่าน (ไม่โพสต์)
  const unnamed = userGroups
    .filter((group) => !group.name || PLACEHOLDER_GROUP_NAME.test(String(group.name).trim()))
    .slice(0, NAME_SCAN_MAX_GROUPS);
  test.setTimeout(4 * 60 * 1000 + unnamed.length * NAME_SCAN_MS_PER_GROUP);

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

  let saved = 0;
  for (const group of unnamed) {
    try {
      if (group.fb_group_id !== target.fb_group_id) {
        await activePage.goto(`https://www.facebook.com/groups/${group.fb_group_id}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
      }
      await activePage.waitForTimeout(2500 + Math.floor(Math.random() * 2500));
      if (await rememberGroupName(group.fb_group_id, await readGroupName(activePage))) saved += 1;
    } catch (e) {
      console.warn(`อ่านชื่อกลุ่ม ${group.fb_group_id} ไม่ได้: ${(e as Error).message}`);
    }
  }
  if (unnamed.length) console.log(`อ่านชื่อกลุ่มที่ยังไม่มีชื่อ: บันทึกได้ ${saved}/${unnamed.length} กลุ่ม`);
});
