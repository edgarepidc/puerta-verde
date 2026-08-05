import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@puertaverde/shared', '@puertaverde/supabase', '@puertaverde/whatsapp'],
};

export default nextConfig;
