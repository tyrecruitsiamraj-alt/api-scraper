/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      'pg',
      'playwright',
      'cheerio',
      'dotenv',
      'puppeteer-core',
      '@sparticuz/chromium-min',
    ],
  },
  // Keep package code (not the remote pack) inside the serverless function.
  outputFileTracingIncludes: {
    '/api/candidates/[id]/pdf': ['./node_modules/@sparticuz/chromium-min/**/*'],
  },
};

export default nextConfig;
