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
const historicalBrandAllowlist = new Set(['AGENTS.md', 'app/reference/history/page.mdx', 'public/superagents.md'])

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
  const repositoryPath = relative(root, file)
  for (const [pattern, description] of forbiddenPublicationPatterns) {
    pattern.lastIndex = 0
    if (pattern.test(content)) failures.push(`${repositoryPath} contains ${description}`)
  }
  if (!historicalBrandAllowlist.has(repositoryPath) && /\binner[ _-]?os\b/i.test(content)) {
    failures.push(`${repositoryPath} contains the retired product name outside the historical allowlist`)
  }
}

const appPages = files.filter((file) => file.startsWith(resolve(root, 'app')) && file.endsWith('page.mdx'))
const routeFiles = new Set(appPages.map((file) => {
  const name = relative(resolve(root, 'app'), file).replace(/\/page\.mdx$/, '')
  return name ? `/${name}` : '/'
}))
const staticRoutes = new Set([
  '/llms.txt',
  '/robots.txt',
  '/sitemap.xml',
  ...files
    .filter((file) => file.startsWith(resolve(root, 'public')))
    .map((file) => `/${relative(resolve(root, 'public'), file)}`),
])

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
    if (!routeFiles.has(target) && !staticRoutes.has(target)) failures.push(`${relative(root, file)} links to missing route ${target}`)
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

const estateCoverage = JSON.parse(readFileSync(resolve(root, 'config/estate-coverage.json'), 'utf8'))
const repositoryFields = [
  'total', 'ownersAndOrganizations', 'active', 'archived', 'private', 'public', 'forks', 'repositoriesAccountedFor',
  'treesScanned', 'emptyRepositories', 'scanFailures', 'truncatedTrees', 'declarationFilesSelected', 'declarationFilesScanned', 'declarationFilesFailed',
]
for (const field of repositoryFields) {
  if (!Number.isInteger(estateCoverage.repositoryEstate?.[field]) || estateCoverage.repositoryEstate[field] < 0) {
    failures.push(`Estate coverage has invalid repository field ${field}`)
  }
}
const estate = estateCoverage.repositoryEstate
if (estate.active + estate.archived !== estate.total) failures.push('Estate active and archived counts do not equal total repositories')
if (estate.private + estate.public !== estate.total) failures.push('Estate private and public counts do not equal total repositories')
if (estate.repositoriesAccountedFor !== estate.total) failures.push('Estate audit did not account for every accessible repository')
if (estate.treesScanned + estate.emptyRepositories + estate.scanFailures !== estate.total) {
  failures.push('Estate tree, empty, and failed counts do not equal total repositories')
}
if (estate.declarationFilesScanned + estate.declarationFilesFailed !== estate.declarationFilesSelected) {
  failures.push('Estate inspected and failed declaration-file counts do not equal selected files')
}
if (!Array.isArray(estateCoverage.devices) || estateCoverage.devices.length < 3) failures.push('Estate coverage must include all declared operating devices')
if (!estateCoverage.devices?.some((device) => device.state === 'directly verified')) failures.push('Estate coverage has no directly verified device')
const deviceIds = new Set(estateCoverage.devices?.map((device) => device.id))
if (deviceIds.size !== estateCoverage.devices?.length) failures.push('Estate coverage contains duplicate device ids')
if (estateCoverage.devicePolicy?.source !== 'STORAGE_SYSTEM.md' || !/^[a-f0-9]{16}$/.test(estateCoverage.devicePolicy?.revision ?? '')) {
  failures.push('Estate devices are not bound to a canonical storage-policy revision')
}
if (!Array.isArray(estateCoverage.sourceSurfaces) || estateCoverage.sourceSurfaces.length < 8) failures.push('Estate coverage is missing canonical source surfaces')
if (!Array.isArray(estateCoverage.integrationFingerprints) || estateCoverage.integrationFingerprints.length === 0) failures.push('Estate coverage has no integration fingerprints')

const catalog = estateCoverage.repositoryCatalog
if (!Array.isArray(catalog) || catalog.length !== estate.total) {
  failures.push('Estate repository catalog must contain one row for every accessible repository')
} else {
  const catalogIds = new Set(catalog.map((entry) => entry.id))
  if (catalogIds.size !== catalog.length) failures.push('Estate repository catalog contains duplicate ids')
  if (catalog.filter((entry) => entry.visibility === 'private').length !== estate.private) failures.push('Estate private catalog rows do not match the private repository count')
  if (catalog.filter((entry) => entry.visibility === 'public').length !== estate.public) failures.push('Estate public catalog rows do not match the public repository count')
  for (const entry of catalog) {
    if (!['tree-scanned', 'empty', 'failed'].includes(entry.scanState)) failures.push(`Repository catalog ${entry.id} has invalid scan state`)
    if (entry.visibility === 'private' && (!/^private-\d{3}$/.test(entry.id) || entry.url !== null)) failures.push(`Private repository catalog row ${entry.id} leaks or lacks its opaque identity contract`)
    if (entry.visibility === 'public' && (!entry.url?.startsWith('https://github.com/') || !entry.id.includes('/'))) failures.push(`Public repository catalog row ${entry.id} lacks its GitHub identity`)
  }
  const activeInstructionGaps = catalog.filter((entry) => entry.lifecycle === 'active' && entry.agentic && entry.instructionStatus === 'gap').length
  const expectedInstructionGaps = estateCoverage.documentationCoverage.activeAgenticRepositories - estateCoverage.documentationCoverage.activeAgenticRepositoriesWithInstructions
  if (activeInstructionGaps !== expectedInstructionGaps) failures.push('Repository catalog does not identify every active agent-instruction gap')
}

const vercelSurface = estateCoverage.sourceSurfaces?.find(([source]) => source === 'Vercel')
if (!vercelSurface || vercelSurface[2] !== 'not verified for this snapshot') failures.push('Estate snapshot must not hard-code Vercel as live-verified before deployment')

const componentFields = ['id', 'title', 'definition', 'allRepositories', 'allFiles', 'activeRepositories', 'activeFiles', 'publicExamples']
const componentIds = new Set()
if (!Array.isArray(estateCoverage.agenticComponents) || estateCoverage.agenticComponents.length < 22) {
  failures.push('Estate coverage is missing the comprehensive agentic component taxonomy')
} else {
  for (const component of estateCoverage.agenticComponents) {
    for (const field of componentFields) {
      if (component[field] === undefined || component[field] === '') failures.push(`Agentic component ${component.id ?? 'unknown'} is missing ${field}`)
    }
    if (componentIds.has(component.id)) failures.push(`Duplicate agentic component id ${component.id}`)
    componentIds.add(component.id)
    for (const field of ['allRepositories', 'allFiles', 'activeRepositories', 'activeFiles']) {
      if (!Number.isInteger(component[field]) || component[field] < 0) failures.push(`Agentic component ${component.id} has invalid ${field}`)
    }
    if (component.activeRepositories > component.allRepositories || component.activeFiles > component.allFiles) {
      failures.push(`Agentic component ${component.id} has active counts greater than estate-wide counts`)
    }
    if (!Array.isArray(component.publicExamples) || component.publicExamples.some((example) => !example.includes(':'))) {
      failures.push(`Agentic component ${component.id} has invalid public evidence samples`)
    }
  }
}

const estateAgeDays = (Date.now() - new Date(estateCoverage.asOf).getTime()) / 86_400_000
if (!Number.isFinite(estateAgeDays) || estateAgeDays > 45) failures.push(`Estate coverage snapshot is stale (${Math.floor(estateAgeDays)} days old)`)

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log(`Docs checks passed: ${routeFiles.size} routes, ${registry.systems.length} systems, ${capabilityInventory.inventories.length} capability inventories, ${estate.total} repositories accounted for, publication scan clean.`)
