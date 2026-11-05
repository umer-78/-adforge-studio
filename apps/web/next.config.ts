import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Hosts the browser talks to directly: Supabase (API, realtime, uploads), object storage and Mux. */
function connectSources(): string[] {
  const out = new Set<string>(["'self'"]);
  const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (supabase) {
    const host = new URL(supabase).host;
    out.add(supabase);
    out.add(`wss://${host}`);
    // Large resumable uploads go to the direct storage host: <ref>.storage.supabase.co
    const ref = host.split('.')[0];
    if (host.endsWith('.supabase.co')) out.add(`https://${ref}.storage.supabase.co`);
  }
  const s3 = origin(process.env.S3_ENDPOINT);
  if (s3) {
    const host = new URL(s3).host;
    out.add(s3);
    out.add(`https://*.${host}`);
  } else if (process.env.STORAGE_DRIVER === 's3') {
    out.add('https://*.amazonaws.com');
  }
  out.add('https://*.r2.cloudflarestorage.com');
  out.add('https://stream.mux.com');
  out.add('https://*.mux.com');
  if (isDev) out.add('ws://localhost:*');
  return [...out];
}

function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js inlines its bootstrap scripts; nonces would force every page to render dynamically.
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), 'blob:'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'media-src': ["'self'", 'data:', 'blob:', 'https:'],
    'connect-src': connectSources(),
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (!isDev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  transpilePackages: ['@adforge/core', '@adforge/compositions'],
  images: { unoptimized: true },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // The versioned public API is the same set of endpoints the app uses.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: '/api/:path*' }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The public MCP and v1 API are called from other origins with API keys, never cookies.
      {
        source: '/api/(v1|mcp)/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Headers', value: 'authorization, content-type, x-workspace-id, mcp-session-id, mcp-protocol-version' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
        ],
      },
    ];
  },
};

export default nextConfig;
