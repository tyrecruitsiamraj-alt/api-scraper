/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['pg', 'playwright', 'cheerio', 'dotenv', 'puppeteer-core', '@sparticuz/chromium'],
  },
};

export default nextConfig;
