import type { NextConfig } from 'next';

import { api_url } from './src/lib/config';
import { contentSecurityPolicy } from './src/lib/csp';

const isDev = process.env.NODE_ENV === 'development';

// `connect-src` must name whichever API origin the *browser* was built to call,
// so this reads the same value the bundle is compiled against. It was once a
// hardcoded localhost, which silently blocked every call in any deployment
// pointing at a real API domain.
const cspHeader = contentSecurityPolicy(api_url, { dev: isDev });

const nextConfig: NextConfig = {
  // Standalone build for the Docker image (apps/web/Dockerfile).
  output: 'standalone',
  // Don't leak framework/version info via the X-Powered-By response header.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
