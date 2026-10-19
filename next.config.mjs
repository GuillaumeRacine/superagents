import nextra from 'nextra'
import { legacyRedirects } from './config/legacy-redirects.mjs'
import { dashboardRedirects } from './config/dashboard-redirects.mjs'
import { publicSiteHeaderRules, publicSiteHostPattern, publicSiteRedirects, publicSiteRewrites } from './config/public-site.mjs'

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
    return [
      // iamgui.com (#49): www → apex before anything else on that host.
      ...publicSiteRedirects,
      ...legacyRedirects,
      // Private dashboards live under /dashboard (#49); the finance split (#44) sub-paths follow.
      ...dashboardRedirects,
    ]
  },
  async rewrites() {
    return {
      // iamgui.com (#49): the public one-pager is served from the guiracine
      // project on that host only. beforeFiles beats robots.ts, sitemap.ts,
      // public/llms.txt and the documentation home page.
      beforeFiles: publicSiteRewrites,
      afterFiles: [],
      fallback: [],
    }
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      // noindex + no-store everywhere except the public passthrough paths on iamgui.com.
      ...publicSiteHeaderRules,
      {
        source: '/superagents.md',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
          { key: 'Content-Disposition', value: 'attachment; filename="superagents.md"' },
          { key: 'Content-Type', value: 'text/markdown; charset=utf-8' },
        ],
      },
      {
        source: '/llms.txt',
        // Not on iamgui.com: there the file is the one-pager's own llms.txt.
        missing: [{ type: 'host', value: publicSiteHostPattern }],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        ],
      },
    ]
  },
})
