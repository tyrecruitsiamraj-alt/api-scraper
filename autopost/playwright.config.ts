import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';
import { getPlaywrightTestTimeoutMs } from './playwright-test-timeout';
dotenv.config({ path: path.resolve(__dirname, '.env') });

const testTimeoutMs = getPlaywrightTestTimeoutMs();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /** โพสต์ FB ใช้เวลานาน — กัน Playwright timeout แล้วปิด Chrome ก่อนโพสต์ครบ (ดู playwright-test-timeout.ts) */
  timeout: testTimeoutMs,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* รันทีละไฟล์ (workers: 1) เพราะแต่ละ test ต้อง login Facebook แยกกัน */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Trace เมื่อเทสต์ล้ม — เปิดด้วย npx playwright show-trace */
    trace: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      /** ไม่มีช่องว่างในชื่อ — กัน Windows/cmd แยก argv ผิดแล้ว Playwright ไม่รันโปรเจกต์ที่ตั้งใจ (หน้าเปล่า) */
      name: 'GoogleChrome',
      /**
       * ไม่ใช้ devices['Desktop Chrome'] (10 พ.ย. 2569) — มันยัด user agent ตายตัว (Windows + Chrome รุ่นของ Playwright)
       * ทับ Chrome จริงทุกหน้าต่าง รวมโปรไฟล์ถาวร ทำให้ user agent ไม่ตรงกับรุ่น Chrome/เครื่องจริง Facebook จับได้
       * ให้ Chrome บอกค่าจริงของตัวเอง ขนาดจอตั้งรายบัญชีใน tests/humanBrowser.fixture.ts
       */
      use: {
        channel: 'chrome',
        viewport: { width: 1366, height: 658 },
        launchOptions: {
          ignoreDefaultArgs: ['--enable-automation'],
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
    },
    {
      name: 'ChromiumCollect',
      /** รันเฉพาะเทสต์เก็บ comment — ไม่รัน postAll/checkFacebookSession ซ้ำแบบ headless */
      testMatch: ['**/collectComments.spec.ts', '**/collectPostComments.logic.spec.ts', '**/facebookAuthState.spec.ts'],
      use: {
        channel: 'chrome',
        viewport: { width: 1366, height: 658 },
        headless: true,
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
