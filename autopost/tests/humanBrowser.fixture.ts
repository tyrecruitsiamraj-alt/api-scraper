import { test as base } from '@playwright/test';

/** ลดสัญญาณ automation ใน Chrome ที่ Playwright เปิด */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await use(context);
  },
});

export { expect } from '@playwright/test';
