import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { legacyRedirects } from '../config/legacy-redirects.mjs'
import { isAllowedEmail } from '../lib/access-policy.mjs'

const port = 3219
const baseUrl = `http://127.0.0.1:${port}`
const canonicalSiteUrl = 'https://superagents-docs.vercel.app'
const allowedEmail = 'owner@example.com'
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
    AUTHORIZED_GOOGLE_EMAIL: allowedEmail,
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

try {
  await waitForServer()

  assert(isAllowedEmail('OWNER@example.com', allowedEmail), 'Allowlist must accept only the normalized configured email')
  assert(!isAllowedEmail('other@example.com', allowedEmail), 'Allowlist must reject a different email')
  assert(!isAllowedEmail(allowedEmail, ''), 'Allowlist must fail closed when it is not configured')

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
  console.log(`Site smoke checks passed: Google provider, exact-email allowlist, auth redirects, RSC, ${legacyRedirects.length} redirects, search, robots, and sitemap.`)
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}
