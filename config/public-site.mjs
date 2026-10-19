// iamgui.com hosting (issue #49).
//
// The public one-pager keeps living in the `guiracine` Vercel project; this
// project serves it on iamgui.com through host-conditioned `beforeFiles`
// rewrites and keeps only the private /dashboard surfaces on the domain.
// Every other path on that host (the documentation) redirects to the
// canonical documentation hostname. Shared by next.config.mjs, proxy.ts and
// the verification scripts so the three stay in agreement.

export const publicSiteHostPattern = '(www\\.)?iamgui\\.com'
export const publicSiteApex = 'iamgui.com'
export const publicSiteWww = 'www.iamgui.com'
export const publicSiteOrigin = 'https://guiracine.vercel.app'
export const canonicalDocsOrigin = 'https://superagents-docs.vercel.app'

const hostMatcher = new RegExp(`^${publicSiteHostPattern}$`, 'i')

// Exact public paths passed through to the one-pager project, unauthenticated.
export const publicPassthroughPaths = [
  '/',
  '/index.html',
  '/og-image.png',
  '/og-image.svg',
  '/og-image.html',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/placeholder.svg',
]

// Public prefixes passed through the same way.
export const publicPassthroughPrefixes = ['/assets/', '/brand/']

// Private surfaces that behave on iamgui.com exactly as on the canonical host.
export const privateOnPublicSitePrefixes = ['/dashboard/', '/api/', '/_next/', '/_pagefind/']

export function isPublicSiteHost(host) {
  if (!host) return false
  return hostMatcher.test(String(host).split(':', 1)[0])
}

export function isPublicPassthroughPath(pathname) {
  return (
    publicPassthroughPaths.includes(pathname) ||
    publicPassthroughPrefixes.some((prefix) => pathname.startsWith(prefix))
  )
}

export function isPrivateOnPublicSite(pathname) {
  return pathname === '/dashboard' || privateOnPublicSitePrefixes.some((prefix) => pathname.startsWith(prefix))
}

export function canonicalDocsUrl(pathname, search = '') {
  return `${canonicalDocsOrigin}${pathname}${search}`
}

const onPublicSite = [{ type: 'host', value: publicSiteHostPattern }]

// `beforeFiles` so these beat app/robots.ts, app/sitemap.ts, public/llms.txt
// and the documentation home page in the filesystem phase.
export const publicSiteRewrites = [
  ...publicPassthroughPaths.map((path) => ({
    source: path,
    has: onPublicSite,
    destination: `${publicSiteOrigin}${path}`,
  })),
  ...publicPassthroughPrefixes.map((prefix) => ({
    source: `${prefix}:path*`,
    has: onPublicSite,
    destination: `${publicSiteOrigin}${prefix}:path*`,
  })),
]

export const publicSiteRedirects = [
  // www → apex, permanently, keeping path and query.
  {
    source: '/:path*',
    has: [{ type: 'host', value: publicSiteWww.replace('.', '\\.') }],
    destination: `https://${publicSiteApex}/:path*`,
    permanent: true,
  },
  // The Markdown corpus bypasses the proxy matcher, so it is sent to the
  // canonical host here instead of being served under the public domain.
  {
    source: '/superagents.md',
    has: onPublicSite,
    destination: `${canonicalDocsOrigin}/superagents.md`,
    permanent: false,
  },
]

export const privateHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
]

// On every other host the private headers apply to every path, as before.
// On iamgui.com they apply only to the private surfaces, never to the public
// passthrough paths.
export const publicSiteHeaderRules = [
  { source: '/:path*', missing: onPublicSite, headers: privateHeaders },
  ...['/dashboard', '/dashboard/:path*', '/api/:path*', '/_next/:path*', '/_pagefind/:path*', '/superagents.md'].map((source) => ({
    source,
    has: onPublicSite,
    headers: privateHeaders,
  })),
]
