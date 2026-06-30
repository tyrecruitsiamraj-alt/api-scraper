/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pg is a server-only dependency; keep it out of the bundle (Next 14.2 name)
  experimental: {
    serverComponentsExternalPackages: ['pg'],
  },
};

export default nextConfig;
