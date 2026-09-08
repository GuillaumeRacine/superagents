import nextra from 'nextra'
import { legacyRedirects } from './config/legacy-redirects.mjs'

const withNextra = nextra({})

export default withNextra({
  images: { unoptimized: true },
  poweredByHeader: false,
  // Nextra's documented alias for Turbopack on Next.js 15.3 and newer.
  turbopack: {
    resolveAlias: {
      'next-mdx-import-source-file': './mdx-components.tsx',
    },
  },
  async redirects() {
    return legacyRedirects
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ]
  },
})
