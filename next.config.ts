import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://app.midtrans.com https://app.sandbox.midtrans.com https://*.midtrans.com https://*.gtflabs.io",
  "frame-src 'self' https://app.midtrans.com https://app.sandbox.midtrans.com https://*.midtrans.com https://*.gtflabs.io",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://app.midtrans.com https://app.sandbox.midtrans.com https://*.midtrans.com https://*.gtflabs.io",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.gtflabs.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.gtflabs.io",
  "font-src 'self' data: https://fonts.gstatic.com https://*.gtflabs.io",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    qualities: [75, 78, 92],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
