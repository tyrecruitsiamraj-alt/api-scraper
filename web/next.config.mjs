import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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
  webpack(config) {
    // src/core/poster.js is shared with the local worker and sits outside
    // web/. On Vercel, dependencies are installed only in web/node_modules,
    // so resolve the renderer explicitly from this app rather than searching
    // upward from src/core.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      playwright: require.resolve('playwright'),
    };
    return config;
  },
};

export default nextConfig;
