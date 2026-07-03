/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['pg', 'playwright', 'cheerio', 'dotenv'],
  },
};

export default nextConfig;
