import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { legacyRedirects } from '../config/legacy-redirects.mjs'

const port = 3219
const baseUrl = `http://127.0.0.1:${port}`
const canonicalSiteUrl = 'https://superagents-docs.vercel.app'
const validAuth = `Basic ${Buffer.from('gui:local-smoke-password').toString('base64')}`
const wrongAuth = `Basic ${Buffer.from('wrong:wrong').toString('base64')}`
const countDocumentationPages = (directory) => readdirSync(directory, { withFileTypes: true })
  .reduce((total, entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return total + countDocumentationPages(path)
    return total + (entry.isFile() && entry.name === 'page.mdx' ? 1 : 0)
  }, 0)
const expectedPageCount = countDocumentationPages(resolve('app'))
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start'], {
  env: { ...process.env, PORT: String(port), DOCS_USER: '', DOCS_PASSWORD: 'local-smoke-password' },
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

  assert((await response('/')).status === 401, 'Anonymous home request must return 401')
  assert((await response('/', { headers: { Authorization: wrongAuth } })).status === 401, 'Wrong credentials must return 401')

  const home = await response('/', { headers: { Authorization: validAuth } })
  assert(home.status === 200, 'Authenticated home request must return 200')
  assert((await home.text()).includes('Super Agents'), 'Authenticated home must contain the portal title')

  const rsc = await response('/reference/system-registry', { headers: { RSC: '1' } })
  assert(rsc.status === 401, 'Anonymous RSC request must return 401')

  const inventory = await response('/reference/capability-inventory', { headers: { Authorization: validAuth } })
  assert(inventory.status === 200 && (await inventory.text()).includes('Codex personal skills'), 'Capability inventory must render')

  for (const redirect of legacyRedirects) {
    const oldPath = redirect.source.replace('/:path*', '')
    const redirected = await response(oldPath, { headers: { Authorization: validAuth } })
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
  console.log(`Site smoke checks passed: auth, RSC, ${legacyRedirects.length} redirects, inventory, search, robots, and sitemap.`)
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}
