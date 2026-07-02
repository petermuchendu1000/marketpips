/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sharp'],
  images: {
    domains: [
      'localhost',
      'supabase.co',
      '*.supabase.co',
      'avatars.githubusercontent.com',
      'lh3.googleusercontent.com',
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    NEXT_PUBLIC_APP_NAME: 'MarketPips',
  },
  async headers() {
    // Same-origin API: reflect only the app origin (never '*' with credentials,
    // which is invalid and unsafe). Cross-origin browsers are denied by default.
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: appOrigin },
          { key: 'Vary', value: 'Origin' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/health',
        destination: '/api/health',
      },
    ]
  },
}

module.exports = nextConfig
