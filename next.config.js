/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['*.cloudflare.com', '*.r2.cloudflarestorage.com'],
  },
}

module.exports = nextConfig
