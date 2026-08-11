/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
    serverComponentsExternalPackages: [
      'pg',
      'playwright',
      'cheerio',
      'dotenv',
      'puppeteer-core',
      '@sparticuz/chromium-min',
    ],
    outputFileTracingIncludes: {
      '/api/candidates/[id]/pdf': ['./node_modules/@sparticuz/chromium-min/**/*'],
    },
  },
};

export default nextConfig;
