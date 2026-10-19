import { spawn } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { legacyRedirects } from '../config/legacy-redirects.mjs'
import { dashboardRedirects } from '../config/dashboard-redirects.mjs'
import { canonicalDocsOrigin, publicSiteApex, publicSiteOrigin, publicSiteWww } from '../config/public-site.mjs'
import { isAllowedEmail } from '../lib/access-policy.mjs'

const port = 3219
const baseUrl = `http://127.0.0.1:${port}`
const canonicalSiteUrl = 'https://superagents-docs.vercel.app'
const allowedEmails = 'owner@example.com,personal@example.com'
const countDocumentationPages = (directory) => readdirSync(directory, { withFileTypes: true })
  .reduce((total, entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return total + countDocumentationPages(path)
    return total + (entry.isFile() && entry.name === 'page.mdx' ? 1 : 0)
  }, 0)
const expectedPageCount = countDocumentationPages(resolve('app'))
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start'], {
  env: {
    ...process.env,
    PORT: String(port),
    AUTH_GOOGLE_ID: 'local-google-client-id',
    AUTH_GOOGLE_SECRET: 'local-google-client-secret',
    AUTH_SECRET: 'local-smoke-secret-that-is-long-enough-for-testing',
    AUTH_TRUST_HOST: 'true',
    AUTHORIZED_GOOGLE_EMAILS: allowedEmails,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk })
server.stderr.on('data', (chunk) => { serverOutput += chunk })

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Server exited early.\n${serverOutput}`)
    try {
      const response = await fetch(`${baseUrl}/robots.txt`)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await delay(100)
  }
  throw new Error(`Server did not become ready.\n${serverOutput}`)
}

async function response(path, options = {}) {
  return fetch(`${baseUrl}${path}`, { redirect: 'manual', ...options })
}

// undici's fetch silently drops a caller-supplied Host header, so host-conditioned
// behaviour is exercised over node:http, the way `curl -H "Host: ..."` would.
function hostResponse(host, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers: { Host: host } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

try {
  await waitForServer()

  assert(isAllowedEmail('OWNER@example.com', allowedEmails), 'Allowlist must accept the normalized first configured email')
  assert(isAllowedEmail('personal@example.com', allowedEmails), 'Allowlist must accept the second configured email')
  assert(!isAllowedEmail('other@example.com', allowedEmails), 'Allowlist must reject an unlisted email from the same domain')
  assert(!isAllowedEmail('owner@example.com', ''), 'Allowlist must fail closed when it is not configured')

  const anonymousHome = await response('/')
  assert(anonymousHome.status === 307, 'Anonymous home request must redirect to Google sign-in')
  const signInLocation = new URL(anonymousHome.headers.get('location'), baseUrl)
  assert(signInLocation.pathname === '/api/auth/signin', 'Anonymous home must redirect to the Auth.js sign-in route')
  assert(signInLocation.searchParams.get('callbackUrl') === '/', 'Sign-in redirect must preserve the requested route')

  const providers = await response('/api/auth/providers')
  const providerCatalog = await providers.json()
  assert(providers.status === 200 && providerCatalog.google?.name === 'Google', 'Auth.js must expose only the Google provider')

  const signInPage = await response('/api/auth/signin')
  assert(signInPage.status === 200 && (await signInPage.text()).includes('Google'), 'Google sign-in page must render')

  const rsc = await response('/reference/system-registry', { headers: { RSC: '1' } })
  assert(rsc.status === 307, 'Anonymous RSC request must redirect to sign-in')

  for (const redirect of legacyRedirects) {
    const oldPath = redirect.source.replace('/:path*', '')
    const redirected = await response(oldPath)
    assert(redirected.status === 308, `${oldPath} must return a permanent redirect`)
    assert(redirected.headers.get('location') === redirect.destination, `${oldPath} must redirect to ${redirect.destination}`)
  }

  for (const redirect of dashboardRedirects) {
    const redirected = await response(redirect.source)
    assert(redirected.status === 308, `${redirect.source} must return a permanent redirect`)
    assert(redirected.headers.get('location') === redirect.destination, `${redirect.source} must redirect to ${redirect.destination}`)
  }
  for (const route of ['/dashboard', '/dashboard/cash', '/dashboard/invest', '/dashboard/business']) {
    const gated = await response(route)
    const location = new URL(gated.headers.get('location') ?? '', baseUrl)
    assert(gated.status === 307 && location.pathname === '/api/auth/signin' && location.searchParams.get('callbackUrl') === route, `${route} must redirect anonymous requests to sign-in`)
  }

  // iamgui.com (#49): public one-pager passthrough, private /dashboard, docs sent to the canonical host.
  const publicHome = await hostResponse(publicSiteApex, '/')
  assert(![307, 308].includes(publicHome.status), `iamgui.com / must not redirect (got ${publicHome.status})`)
  assert(!publicHome.headers['x-robots-tag'], 'iamgui.com / must not carry the noindex header')
  assert(!/no-store/.test(publicHome.headers['cache-control'] ?? ''), 'iamgui.com / must not be no-store')
  assert(!publicHome.body.includes('/api/auth/signin'), 'iamgui.com / must not render the sign-in page')
  if (publicHome.status === 200) {
    const upstream = await fetch(`${publicSiteOrigin}/`).then((r) => r.text()).catch(() => null)
    if (upstream !== null) assert(publicHome.body === upstream, 'iamgui.com / must serve the one-pager byte for byte')
  } else {
    console.warn(`iamgui.com / passthrough returned ${publicHome.status}: the one-pager origin is unreachable from here; redirect and header checks still hold.`)
  }
  for (const path of ['/robots.txt', '/llms.txt', '/sitemap.xml', '/favicon.ico', '/assets/x.css', '/brand/x.svg']) {
    const passthrough = await hostResponse(publicSiteApex, path)
    assert(![307, 308].includes(passthrough.status), `iamgui.com ${path} must pass through (got ${passthrough.status})`)
    assert(!passthrough.headers['x-robots-tag'], `iamgui.com ${path} must not carry the noindex header`)
    if (path === '/robots.txt' && passthrough.status === 200) assert(!passthrough.body.includes('Disallow: /\n'), 'iamgui.com robots.txt must be the public one-pager policy')
  }
  for (const route of ['/dashboard', '/dashboard/cash', '/dashboard/invest', '/dashboard/business']) {
    const gated = await hostResponse(publicSiteApex, route)
    const location = new URL(gated.headers.location ?? '', baseUrl)
    assert(gated.status === 307 && location.pathname === '/api/auth/signin' && location.searchParams.get('callbackUrl') === route, `iamgui.com ${route} must redirect to sign-in`)
    assert(/no-store/.test(gated.headers['cache-control'] ?? '') && /noindex/.test(gated.headers['x-robots-tag'] ?? ''), `iamgui.com ${route} must stay private and noindex`)
  }
  const apiOnPublic = await hostResponse(publicSiteApex, '/api/auth/providers')
  assert(apiOnPublic.status === 200 && JSON.parse(apiOnPublic.body).google?.name === 'Google', 'iamgui.com must serve Auth.js routes')
  for (const [path, expected] of [
    ['/architecture', `${canonicalDocsOrigin}/architecture`],
    ['/reference/system-registry?x=1', `${canonicalDocsOrigin}/reference/system-registry?x=1`],
    ['/superagents.md', `${canonicalDocsOrigin}/superagents.md`],
  ]) {
    const docs = await hostResponse(publicSiteApex, path)
    assert(docs.status === 307, `iamgui.com ${path} must redirect to the canonical host (got ${docs.status})`)
    assert(docs.headers.location === expected, `iamgui.com ${path} must redirect to ${expected}, got ${docs.headers.location}`)
  }
  const movedOnPublic = await hostResponse(publicSiteApex, '/finance')
  assert(movedOnPublic.status === 308 && movedOnPublic.headers.location === '/dashboard', 'iamgui.com /finance must redirect to /dashboard')
  for (const path of ['/', '/dashboard', '/architecture?q=1']) {
    const www = await hostResponse(publicSiteWww, path)
    // The root redirects to `https://iamgui.com` (no trailing slash); compare normalized URLs.
    assert(www.status === 308 && new URL(www.headers.location ?? '', baseUrl).href === new URL(path, `https://${publicSiteApex}`).href, `www.iamgui.com ${path} must redirect to the apex, got ${www.status} ${www.headers.location}`)
  }
  const otherHost = await hostResponse('example.com', '/')
  assert(otherHost.status === 307 && /noindex/.test(otherHost.headers['x-robots-tag'] ?? ''), 'Other hosts keep the sign-in gate and noindex header')

  const search = await response('/_pagefind/pagefind-entry.json')
  const searchMetadata = await search.json()
  assert(search.status === 200 && searchMetadata.languages.en.page_count === expectedPageCount, `Public search index must contain all ${expectedPageCount} docs pages`)

  const robots = await response('/robots.txt')
  assert(robots.status === 200 && (await robots.text()).includes('Disallow: /'), 'Public robots policy must disallow indexing')

  const sitemap = await response('/sitemap.xml')
  const sitemapBody = await sitemap.text()
  const sitemapLocations = [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])

  assert(sitemap.status === 200 && sitemapLocations.length === expectedPageCount, `Public sitemap must list all ${expectedPageCount} docs pages`)
  assert(sitemapLocations.every((location) => location === canonicalSiteUrl || location.startsWith(`${canonicalSiteUrl}/`)), `Every sitemap URL must use ${canonicalSiteUrl}`)

  const markdownExport = await response('/superagents.md')
  const markdownBody = await markdownExport.text()
  const exportedPageCount = (markdownBody.match(/<!-- source-page:/g) ?? []).length
  assert(markdownExport.status === 200, 'Complete Markdown export must be public')
  assert(markdownExport.headers.get('content-type')?.startsWith('text/markdown'), 'Complete export must use the Markdown content type')
  assert(markdownExport.headers.get('content-disposition')?.includes('superagents.md'), 'Complete export must download with the canonical filename')
  assert(exportedPageCount === expectedPageCount, `Complete Markdown export must contain all ${expectedPageCount} docs pages`)

  const llmsIndex = await response('/llms.txt')
  const llmsBody = await llmsIndex.text()
  assert(llmsIndex.status === 200, 'llms.txt must be public')
  assert(llmsBody.includes(`${canonicalSiteUrl}/superagents.md`), 'llms.txt must link the complete Markdown export')
  assert(llmsBody.includes(`${canonicalSiteUrl}/sitemap.xml`), 'llms.txt must link the XML sitemap')
  console.log(`Site smoke checks passed: Google provider, exact-email allowlist, auth redirects, RSC, ${legacyRedirects.length} legacy and ${dashboardRedirects.length} dashboard redirects, iamgui.com host behaviour, search, robots, sitemap, and ${exportedPageCount}-page agent export.`)
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}
