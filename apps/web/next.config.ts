import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@puertaverde/shared', '@puertaverde/supabase', '@puertaverde/whatsapp'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  async redirects() {
    return [
      { source: '/tienda-citte', destination: '/la-cite', permanent: true },
      { source: '/puerta-verde-demo', destination: '/la-cite', permanent: true },
    ];
  },
};

export default nextConfig;
