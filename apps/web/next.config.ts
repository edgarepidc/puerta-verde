import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@puertaverde/shared', '@puertaverde/supabase', '@puertaverde/whatsapp'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default nextConfig;
