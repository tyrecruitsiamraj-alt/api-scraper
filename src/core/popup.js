import { sleep } from '../config.js';

/**
 * Dismiss ad/cookie/modal popups that may appear after login.
 * Handles the cases the user flagged: sometimes none, sometimes one,
 * sometimes 2+ stacked. We loop until nothing dismissable remains.
 *
 * Only relevant on the browser login step — the HTTP scraping path never
 * renders these, so popups can't block data collection there.
 */
const CLOSE_SELECTORS = [
  '.modal.show .close',
  '.modal.in .close',
  'button.close',
  '[aria-label="Close" i]',
  '[aria-label="ปิด"]',
  '.fancybox-close, .fancybox-close-small',
  '.popup-close, .btn-close, .close-popup, .modal-close',
  'a[onclick*="close" i]',
  '.swal2-close',
];
const COOKIE_TEXTS = ['ยอมรับ', 'ยอมรับทั้งหมด', 'Accept', 'ตกลง'];

async function clickIfVisible(locator) {
  try {
    const n = await locator.count();
    for (let i = 0; i < n; i += 1) {
      const el = locator.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 2000 }).catch(() => {});
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

export async function dismissOverlays(page, { rounds = 3, debug = false } = {}) {
  let dismissed = 0;
  for (let r = 0; r < rounds; r += 1) {
    let actedThisRound = false;

    // cookie/consent banners (decline non-essential → accept-essential acceptable here)
    for (const t of COOKIE_TEXTS) {
      if (await clickIfVisible(page.getByRole('button', { name: t, exact: false }))) {
        actedThisRound = true;
        break;
      }
    }

    // explicit close controls
    for (const sel of CLOSE_SELECTORS) {
      if (await clickIfVisible(page.locator(sel))) {
        actedThisRound = true;
        break;
      }
    }

    // last resort: a high z-index overlay → press Escape
    if (!actedThisRound) {
      const overlay = await page
        .locator('.modal.show, .modal.in, .fancybox-container, .popup, .overlay')
        .first()
        .isVisible()
        .catch(() => false);
      if (overlay) {
        await page.keyboard.press('Escape').catch(() => {});
        actedThisRound = true;
      }
    }

    if (actedThisRound) {
      dismissed += 1;
      await sleep(600);
    } else {
      break; // nothing left to dismiss
    }
  }
  if (debug && dismissed) console.log(`  dismissed ${dismissed} popup(s)`);
  return dismissed;
}
