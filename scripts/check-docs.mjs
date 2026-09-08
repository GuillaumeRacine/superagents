import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { legacyRedirects } from '../config/legacy-redirects.mjs'

const root = process.cwd()
const ignored = new Set(['.git', '.next', '.next-docs', '_pagefind', 'node_modules'])
const textExtensions = new Set(['.js', '.json', '.md', '.mdx', '.mjs', '.ts', '.tsx', '.yml', '.yaml'])
const failures = []

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return []
    const full = join(directory, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const files = walk(root).filter((file) => textExtensions.has(extname(file)))
const publishable = files.filter((file) => !['package-lock.json', 'scripts/check-docs.mjs'].includes(relative(root, file)))

const forbiddenPublicationPatterns = [
  [/\/Users\/[A-Za-z0-9._-]+\//g, 'absolute home path'],
  [/\/Volumes\//g, 'active external-volume path'],
  [/https?:\/\/(?:www\.)?notion\.so\//gi, 'private Notion URL'],
  [/https?:\/\/drive\.google\.com\//gi, 'private Google Drive URL'],
  [/\brm\s+-rf\b/g, 'destructive recursive delete command'],
  [/~\/\.secrets\b/g, 'deprecated plaintext secrets location'],
  [/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g, 'credential-like token'],
]

for (const file of publishable) {
  const content = readFileSync(file, 'utf8')
  for (const [pattern, description] of forbiddenPublicationPatterns) {
    pattern.lastIndex = 0
    if (pattern.test(content)) failures.push(`${relative(root, file)} contains ${description}`)
  }
}

const appPages = files.filter((file) => file.startsWith(resolve(root, 'app')) && file.endsWith('page.mdx'))
const routeFiles = new Set(appPages.map((file) => {
  const name = relative(resolve(root, 'app'), file).replace(/\/page\.mdx$/, '')
  return name ? `/${name}` : '/'
}))

const requiredLegacyRoutes = [
  '/getting-started',
  '/agents',
  '/skills-commands',
  '/writing-pipeline',
  '/reference/system-stats',
  '/architecture/overview',
]

const redirectSources = new Set()
for (const redirect of legacyRedirects) {
  if (redirectSources.has(redirect.source)) failures.push(`Duplicate legacy redirect ${redirect.source}`)
  redirectSources.add(redirect.source)
  if (!redirect.permanent) failures.push(`Legacy redirect ${redirect.source} must be permanent`)
  if (!routeFiles.has(redirect.destination)) failures.push(`Legacy redirect ${redirect.source} targets missing route ${redirect.destination}`)
}
for (const route of requiredLegacyRoutes) {
  const covered = legacyRedirects.some(({ source }) => source === route || source === `${route}/:path*`)
  if (!covered) failures.push(`Missing required legacy redirect for ${route}`)
}

if (routeFiles.size < 20) failures.push(`Expected at least 20 documentation routes; found ${routeFiles.size}`)

for (const file of appPages) {
  const content = readFileSync(file, 'utf8')
  const h1Count = (content.match(/^# [^#]/gm) ?? []).length
  if (h1Count !== 1) failures.push(`${relative(root, file)} must contain exactly one H1; found ${h1Count}`)

  for (const match of content.matchAll(/\[[^\]]+\]\((\/[^)\s#?]*)(?:[?#][^)]*)?\)/g)) {
    const target = match[1] || '/'
    if (!routeFiles.has(target)) failures.push(`${relative(root, file)} links to missing route ${target}`)
  }
}

for (const file of files.filter((item) => item.endsWith('_meta.js'))) {
  const content = readFileSync(file, 'utf8')
  if (/\:\s*['"]\s*['"]/.test(content)) failures.push(`${relative(root, file)} contains a blank navigation label`)

  const directory = dirname(file)
  const navigation = (await import(`${pathToFileURL(file).href}?docs-check`)).default
  const expected = new Set(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, 'page.mdx')))
      .map((entry) => entry.name),
  )
  if (existsSync(join(directory, 'page.mdx'))) expected.add('index')

  for (const name of expected) {
    if (!(name in navigation)) failures.push(`${relative(root, file)} is missing navigation entry ${name}`)
  }
  for (const name of Object.keys(navigation)) {
    const target = name === 'index' ? join(directory, 'page.mdx') : join(directory, name, 'page.mdx')
    if (!existsSync(target)) failures.push(`${relative(root, file)} links navigation entry ${name} to no page`)
  }
}

const registry = JSON.parse(readFileSync(resolve(root, 'config/system-registry.json'), 'utf8'))
const requiredFields = ['id', 'title', 'route', 'kind', 'status', 'owner', 'source', 'measurement', 'trigger', 'permissions', 'inputs', 'outputs', 'proof', 'lastVerified', 'recovery', 'version', 'counts']
const ids = new Set()
for (const system of registry.systems) {
  for (const field of requiredFields) {
    if (system[field] === undefined || system[field] === '') failures.push(`Registry ${system.id ?? 'unknown'} is missing ${field}`)
  }
  if (ids.has(system.id)) failures.push(`Duplicate registry id ${system.id}`)
  ids.add(system.id)
  if (!routeFiles.has(system.route)) failures.push(`Registry ${system.id} links to missing route ${system.route}`)
}

const ageDays = (Date.now() - new Date(registry.asOf).getTime()) / 86_400_000
if (!Number.isFinite(ageDays) || ageDays > 45) failures.push(`Registry snapshot is stale (${Math.floor(ageDays)} days old)`)

const capabilityInventory = JSON.parse(readFileSync(resolve(root, 'config/capability-inventory.json'), 'utf8'))
const capabilityFields = ['id', 'title', 'runtime', 'count', 'detailLevel', 'state', 'source', 'countingRule', 'items']
const capabilityIds = new Set()
for (const inventory of capabilityInventory.inventories) {
  for (const field of capabilityFields) {
    if (inventory[field] === undefined || inventory[field] === '') failures.push(`Capability inventory ${inventory.id ?? 'unknown'} is missing ${field}`)
  }
  if (capabilityIds.has(inventory.id)) failures.push(`Duplicate capability inventory id ${inventory.id}`)
  capabilityIds.add(inventory.id)
  if (!Number.isInteger(inventory.count) || inventory.count < 0) failures.push(`Capability inventory ${inventory.id} has invalid count`)
  if (!Array.isArray(inventory.items) || inventory.items.length === 0) failures.push(`Capability inventory ${inventory.id} has no published items or groups`)
  if (inventory.detailLevel === 'item' && inventory.items.length !== inventory.count) {
    failures.push(`Capability inventory ${inventory.id} publishes ${inventory.items.length} items but claims ${inventory.count}`)
  }
}

const capabilityAgeDays = (Date.now() - new Date(capabilityInventory.asOf).getTime()) / 86_400_000
if (!Number.isFinite(capabilityAgeDays) || capabilityAgeDays > 45) failures.push(`Capability inventory snapshot is stale (${Math.floor(capabilityAgeDays)} days old)`)

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log(`Docs checks passed: ${routeFiles.size} routes, ${registry.systems.length} systems, ${capabilityInventory.inventories.length} capability inventories, publication scan clean.`)
