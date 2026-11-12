import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // RM009 build เว็บใหม่ลงอีกช่อง (.next-slot-a / -b) ระหว่างตัวเดิมยังเปิดอยู่ แล้วค่อยสลับ (scripts/web-host.mjs)
  // ไม่ตั้ง = .next ตามเดิม
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Next 15: ย้าย 2 ค่านี้ออกจาก experimental
  serverExternalPackages: [
    'pg',
    'playwright',
    'cheerio',
    'dotenv',
    'puppeteer-core',
    '@sparticuz/chromium-min',
    // ตัวอ่าน PDF ตอนอัปโหลดเรซูเม่ (pdf.js) — โหลดตอนรันจาก node_modules ไม่รวมเข้า bundle
    'unpdf',
  ],
  outputFileTracingIncludes: {
    '/api/candidates/[id]/pdf': ['./node_modules/@sparticuz/chromium-min/**/*'],
    '/orchestrator/[id]/page': ['./node_modules/@sparticuz/chromium-min/**/*'],
    '/(app)/orchestrator/[id]/page': ['./node_modules/@sparticuz/chromium-min/**/*'],
  },
  experimental: {
    externalDir: true,
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  webpack(config) {
    // src/core/poster.js is shared with the local worker and sits outside
    // web/. On Vercel, dependencies are installed only in web/node_modules,
    // so resolve the renderer explicitly from this app rather than searching
    // upward from src/core.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      playwright: require.resolve('playwright'),
      'puppeteer-core': require.resolve('puppeteer-core'),
      '@sparticuz/chromium-min': require.resolve('@sparticuz/chromium-min'),
      cheerio: require.resolve('cheerio'),
    };
    // ไฟล์ CommonJS ของ autopost/server ที่หน้าเว็บฝั่ง browser ใช้ร่วม (ข้อความตอบคอมเมนต์)
    // โหมด dev ใส่โค้ด hot reload ที่มี import.meta — ต้องให้ webpack อ่านไฟล์นี้แบบ auto ไม่งั้นหน้าเว็บโหลดไม่ขึ้น
    config.module.rules.push({ test: /[\\/]autopost[\\/]server[\\/]comment-reply-templates\.js$/, type: 'javascript/auto' });
    return config;
  },
};

export default nextConfig;
