import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const owner = 'GuillaumeRacine'
const root = process.cwd()
const userHome = homedir()
const codeRoot = join(userHome, 'code')
const contextRoot = join(userHome, 'Context')
const vaultRoot = join(userHome, 'Obs_Vault')
const hermesRoot = join(userHome, '.hermes')
const externalSsdPath = join('/', 'Volumes', 'SSD')
const storagePolicyPath = join(userHome, 'Documents', 'Shared Vault', '0_InnerContext', 'STORAGE_SYSTEM.md')
const extraCheckoutRoots = [contextRoot, vaultRoot]
const outputPath = resolve(root, 'config/estate-coverage.json')
const apiBase = 'https://api.github.com'
const ignoredPathParts = new Set([
  '.git', '.next', '.venv', 'build', 'coverage', 'dist', 'node_modules', 'vendor',
])

const integrationRules = [
  ['1password', /\b(?:1password|op:\/\/|op cli)\b/i],
  ['anthropic', /\b(?:anthropic|claude(?:[-_ ]?api)?)\b/i],
  ['aws-s3', /\b(?:amazon s3|aws[_ -]?s3|s3[_ -]?bucket)\b/i],
  ['clerk', /\bclerk\b/i],
  ['discord', /\bdiscord\b/i],
  ['dropbox', /\bdropbox\b/i],
  ['firecrawl', /\bfirecrawl\b/i],
  ['gemini', /\b(?:gemini|google generative ai)\b/i],
  ['github', /\b(?:github|octokit)\b/i],
  ['google-services', /\b(?:gmail|google drive|google sheets|google calendar|google cloud)\b/i],
  ['ghost', /\bghost(?: cms)?\b/i],
  ['monarch', /\bmonarch(?: money)?\b/i],
  ['mongodb', /\b(?:mongodb|mongoose)\b/i],
  ['notion', /\bnotion\b/i],
  ['openai', /\bopenai\b/i],
  ['postgres', /\b(?:postgres|postgresql|pgvector)\b/i],
  ['redis-upstash', /\b(?:redis|upstash)\b/i],
  ['resend', /\bresend\b/i],
  ['sentry', /\bsentry\b/i],
  ['shopify', /\bshopify\b/i],
  ['slack', /\bslack\b/i],
  ['spotify', /\bspotify\b/i],
  ['sqlite', /\bsqlite\b/i],
  ['stripe', /\bstripe\b/i],
  ['substack', /\bsubstack\b/i],
  ['supabase', /\bsupabase\b/i],
  ['telegram', /\btelegram\b/i],
  ['vercel', /\bvercel\b/i],
  ['x-twitter', /\b(?:twitter|x api|x\.com)\b/i],
]

const definitionExtension = /\.(?:md|mdx|json|ya?ml|toml|ts|tsx|js|mjs|py|sh)$/i
const agenticComponentRules = [
  {
    id: 'instruction-layers',
    title: 'Agent instruction layers',
    definition: 'Repository or directory policy files consumed by agent runtimes.',
    matches: (path) => /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|GROK|CODEX)\.md$/i.test(path),
  },
  {
    id: 'agent-definitions',
    title: 'Agent and subagent definitions',
    definition: 'Named agent, subagent, coach, or specialist definition files.',
    matches: (path) => /(?:^|\/)(?:agents?|subagents?|coaches?|specialists?)\/[^/]+\.(?:md|mdx|json|ya?ml)$/i.test(path),
  },
  {
    id: 'skill-manifests',
    title: 'Skill manifests',
    definition: 'SKILL.md packages and repository-owned skill definitions.',
    matches: (path) => /(?:^|\/)SKILL\.md$/i.test(path),
  },
  {
    id: 'commands',
    title: 'Commands and slash actions',
    definition: 'Reusable command definitions exposed to an agent runtime.',
    matches: (path) => /(?:^|\/)(?:commands?|slash-commands?)\/[^/]+\.(?:md|mdx|json|ya?ml|toml)$/i.test(path),
  },
  {
    id: 'prompts',
    title: 'Prompt definitions',
    definition: 'Repository-owned prompt templates, system prompts, and prompt packs.',
    matches: (path) => /(?:^|\/)(?:prompts?|system-prompts?)\/[^/]+\.(?:md|mdx|txt|json|ya?ml)$/i.test(path),
  },
  {
    id: 'mcp-definitions',
    title: 'MCP definitions',
    definition: 'MCP server, client, tool, and configuration definitions.',
    matches: (path) => /(?:^|\/)(?:mcp|mcp-servers?|mcp-tools?)(?:\/|[-_.])[^/]*\.(?:json|ya?ml|toml|ts|js|mjs|py|md)$/i.test(path)
      || /(?:^|\/)\.mcp\.json$/i.test(path),
  },
  {
    id: 'plugin-manifests',
    title: 'Plugin manifests',
    definition: 'Agent-runtime plugin descriptors and repository-owned plugin packages.',
    matches: (path) => /(?:^|\/)(?:\.claude-plugin|\.codex-plugin|plugins?)\/(?:[^/]+\/)*(?:plugin|manifest|package)\.(?:json|ya?ml|toml)$/i.test(path),
  },
  {
    id: 'hooks-and-rules',
    title: 'Hooks and policy rules',
    definition: 'Lifecycle hooks, guards, routing rules, and runtime policy modules.',
    matches: (path) => (/(?:^|\/)(?:\.claude|\.codex|\.gemini|\.grok|\.hermes)\/hooks?\/[^/]+/i.test(path)
      || /(?:^|\/)(?:agent-hooks?|lifecycle-hooks?|rules?|guards?|policies?)\/[^/]+/i.test(path))
      && definitionExtension.test(path),
  },
  {
    id: 'automations-and-schedules',
    title: 'Automations and schedules',
    definition: 'GitHub workflows, cron definitions, automations, and scheduled job declarations.',
    matches: (path) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)
      || (/(?:^|\/)(?:automations?|cron|schedules?|jobs?)\/[^/]+/i.test(path) && definitionExtension.test(path)),
  },
  {
    id: 'profiles-and-personas',
    title: 'Profiles and personas',
    definition: 'Runtime profiles, personas, souls, and role definitions.',
    matches: (path) => /(?:^|\/)(?:profiles?|personas?|souls?)\/[^/]+/i.test(path) && definitionExtension.test(path)
      || /(?:^|\/)SOUL\.md$/i.test(path),
  },
  {
    id: 'context-and-memory',
    title: 'Context and memory assets',
    definition: 'Curated context, memory, knowledge, and retrieval declarations used by agents.',
    matches: (path) => /(?:^|\/)(?:context|memory|memories|knowledge)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'orchestration-graphs',
    title: 'Orchestration graphs and pipelines',
    definition: 'Multi-step agent graphs, pipelines, and workflow orchestration definitions.',
    matches: (path) => /(?:^|\/)(?:graphs?|pipelines?|orchestration|workflows?)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'evaluation-and-proof',
    title: 'Evaluation, observability, and proof',
    definition: 'Evals, evidence contracts, proof bundles, audits, and agent observability assets.',
    matches: (path) => /(?:^|\/)(?:evals?|evaluations?|evidence|proof|audits?|observability)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'tools-and-connectors',
    title: 'Tools and connectors',
    definition: 'Repository-owned tools, connectors, integrations, and callable capability definitions.',
    matches: (path) => /(?:^|\/)(?:tools?|connectors?|integrations?)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'models-providers-and-routing',
    title: 'Models, providers, and routing',
    definition: 'Model catalogs, provider adapters, routing policies, and fallback declarations.',
    matches: (path) => /(?:^|\/)(?:models?|providers?|routers?|routing)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'retrieval-and-indexes',
    title: 'Retrieval and indexes',
    definition: 'Retrieval pipelines, vector/index definitions, embeddings, and search assets.',
    matches: (path) => /(?:^|\/)(?:retrieval|indexes?|embeddings?|vector(?:s|stores?)?|search)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'state-and-persistence',
    title: 'State and persistence',
    definition: 'Agent state, checkpoints, session stores, and persistence declarations.',
    matches: (path) => /(?:^|\/)(?:state|checkpoints?|sessions?|persistence|stores?)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'interfaces-and-channels',
    title: 'Interfaces and delivery channels',
    definition: 'Agent-facing applications, channel adapters, transports, and delivery surfaces.',
    matches: (path) => /(?:^|\/)(?:channels?|adapters?|transports?|interfaces?)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'permissions-and-security',
    title: 'Permissions and security contracts',
    definition: 'Authentication, authorization, permission, secret-reference, and safety contracts.',
    matches: (path) => /(?:^|\/)(?:auth|security|permissions?|secrets?|safety)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'runtime-and-deployment',
    title: 'Runtime and deployment definitions',
    definition: 'Containers, hosting, service, worker, and runtime deployment declarations.',
    matches: (path) => /(?:^|\/)(?:Dockerfile|vercel\.json|wrangler\.toml|docker-compose\.ya?ml)$/i.test(path)
      || (/(?:^|\/)(?:deploy|deployment|runtime|services?|workers?)\/[^/]+/i.test(path) && definitionExtension.test(path)),
  },
  {
    id: 'schemas-and-contracts',
    title: 'Schemas and contracts',
    definition: 'Typed schemas, protocols, event contracts, and structured input/output definitions.',
    matches: (path) => /(?:^|\/)(?:schemas?|contracts?|protocols?|events?)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
  {
    id: 'templates-and-artifacts',
    title: 'Templates and artifacts',
    definition: 'Reusable agent templates, artifact specifications, and output-format definitions.',
    matches: (path) => /(?:^|\/)(?:templates?|artifacts?|outputs?)\/[^/]+/i.test(path) && definitionExtension.test(path),
  },
]
const coreAgenticComponentIds = new Set([
  'instruction-layers',
  'agent-definitions',
  'skill-manifests',
  'commands',
  'prompts',
  'mcp-definitions',
  'plugin-manifests',
  'profiles-and-personas',
])

function command(commandName, args) {
  return execFileSync(commandName, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

function normalizeGithubRemote(remote) {
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i)
  return match ? `${match[1]}/${match[2]}` : null
}

function listLocalCheckouts() {
  const candidates = readdirSync(codeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(codeRoot, entry.name, '.git')))
    .map((entry) => join(codeRoot, entry.name))

  for (const path of extraCheckoutRoots) {
    if (existsSync(join(path, '.git'))) candidates.push(path)
  }

  return candidates.map((path) => {
    let remote = ''
    try {
      remote = command('git', ['-C', path, 'remote', 'get-url', 'origin'])
    } catch {
      // A local-only repository is still part of the checkout census.
    }
    return { path, remote: normalizeGithubRemote(remote) }
  })
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let index = 0
  async function run() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

function isIgnored(path) {
  return path.split('/').some((part) => ignoredPathParts.has(part) || part.startsWith('._'))
}

function isDocumentation(path) {
  if (isIgnored(path)) return false
  return /(?:^|\/)(?:readme|agents|claude|gemini|grok)(?:\.[^/]+)?$/i.test(path)
    || /\.(?:md|mdx|rst|adoc)$/i.test(path)
}

function isDeclarationCandidate(entry) {
  if (entry.type !== 'blob' || isIgnored(entry.path) || (entry.size ?? 0) > 250_000) return false
  const path = entry.path.toLowerCase()
  const name = basename(path)
  return /^readme(?:\.[^/]+)?$/.test(name)
    || ['package.json', 'pyproject.toml', 'vercel.json', 'wrangler.toml', 'docker-compose.yml', 'docker-compose.yaml'].includes(name)
    || /^requirements.*\.txt$/.test(name)
    || /^(?:\.env(?:\.example|\.sample)|env\.example|example\.env)$/.test(name)
    || /(?:^|\/)prisma\/schema\.prisma$/.test(path)
    || /(?:^|\/)(?:architecture|integrations?|data-sources?|systems?)(?:\/|[-_.]).*\.(?:md|mdx|ya?ml|json)$/.test(path)
}

const repositoryQuery = `query($endCursor:String) {
  viewer {
    repositories(
      first: 100
      after: $endCursor
      affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
    ) {
      nodes {
        name
        nameWithOwner
        owner { login }
        isPrivate
        isArchived
        isFork
        updatedAt
        url
        diskUsage
        defaultBranchRef { name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`
const repositoryPages = JSON.parse(command('gh', [
  'api', 'graphql', '--paginate', '--slurp', '-f', `query=${repositoryQuery}`,
]))
const repositories = repositoryPages.flatMap((page) => page.data.viewer.repositories.nodes)
const token = command('gh', ['auth', 'token'])
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'superagents-estate-audit',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function github(path) {
  const response = await fetch(`${apiBase}${path}`, { headers })
  if (!response.ok) throw new Error(`${response.status} ${path}`)
  return response.json()
}

async function scanRepository(repository) {
  const branch = repository.defaultBranchRef?.name
  if (!branch) return { repository, scanned: false, empty: true, truncated: false, providers: [] }
  const [repositoryOwner, repositoryName] = repository.nameWithOwner.split('/')
  const repositoryPath = `/repos/${encodeURIComponent(repositoryOwner)}/${encodeURIComponent(repositoryName)}`

  try {
    const tree = await github(`${repositoryPath}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
    const entries = tree.tree ?? []
    const paths = entries.map((entry) => entry.path)
    const definitionPaths = entries.filter((entry) => entry.type === 'blob' && !isIgnored(entry.path)).map((entry) => entry.path)
    const documentationPaths = paths.filter(isDocumentation)
    const instructions = paths.filter((path) => /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|GROK|CODEX)\.md$/i.test(path))
    const candidates = entries.filter(isDeclarationCandidate).slice(0, 16)
    const declarationReads = await mapLimit(candidates, 4, async (entry) => {
      try {
        const blob = await github(`${repositoryPath}/git/blobs/${entry.sha}`)
        return { ok: true, text: Buffer.from(blob.content ?? '', blob.encoding ?? 'base64').toString('utf8') }
      } catch {
        return { ok: false, text: '' }
      }
    })
    const sourceTexts = declarationReads.map((read) => read.text)
    const fingerprintText = `${repository.name}\n${paths.join('\n')}\n${sourceTexts.join('\n')}`
    const providers = integrationRules.filter(([, pattern]) => pattern.test(fingerprintText)).map(([name]) => name)
    const componentCounts = Object.fromEntries(agenticComponentRules.map((rule) => [
      rule.id,
      definitionPaths.filter((path) => rule.matches(path)).length,
    ]))
    const componentSamples = Object.fromEntries(agenticComponentRules.map((rule) => [
      rule.id,
      definitionPaths.filter((path) => rule.matches(path)).slice(0, 3),
    ]))
    const agentic = /(?:agent|ai-|llm|claude|codex|hermes)/i.test(repository.name)
      || [...coreAgenticComponentIds].some((id) => componentCounts[id] > 0)

    return {
      repository,
      scanned: true,
      empty: false,
      truncated: Boolean(tree.truncated),
      documentationFiles: documentationPaths.length,
      hasDocumentation: documentationPaths.length > 0,
      hasRootReadme: paths.some((path) => /^readme(?:\.[^/]+)?$/i.test(path)),
      hasDocsDirectory: paths.some((path) => /^docs\//i.test(path)),
      hasAgentInstructions: instructions.length > 0,
      workflowDefinitions: paths.filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)).length,
      skillManifests: paths.filter((path) => /(?:^|\/)SKILL\.md$/i.test(path)).length,
      agentic,
      providers,
      componentCounts,
      componentSamples,
      declarationFilesSelected: candidates.length,
      declarationFilesScanned: declarationReads.filter((read) => read.ok).length,
      declarationFilesFailed: declarationReads.filter((read) => !read.ok).length,
    }
  } catch (error) {
    return { repository, scanned: false, empty: false, truncated: false, providers: [], error: error.message }
  }
}

console.log(`Scanning ${repositories.length} GitHub repository trees and declaration surfaces…`)
const scans = await mapLimit(repositories, 6, scanRepository)
const scanned = scans.filter((scan) => scan.scanned)
const active = scans.filter((scan) => !scan.repository.isArchived)
const activeScanned = active.filter((scan) => scan.scanned)
const agentic = scans.filter((scan) => scan.agentic)
const activeAgentic = active.filter((scan) => scan.agentic)
const local = listLocalCheckouts()
const localRemotes = local.map((checkout) => checkout.remote).filter(Boolean)
const uniqueLocalRemotes = new Set(localRemotes)
const ownedLocalRemotes = new Set([...uniqueLocalRemotes].filter((remote) => remote.startsWith(`${owner}/`)))
const accessibleGithubRemotes = new Set(repositories.map((repository) => repository.nameWithOwner.toLowerCase()))
const estateLocalRemotes = new Set([...uniqueLocalRemotes].filter((remote) => accessibleGithubRemotes.has(remote.toLowerCase())))
const repositoryOwnerCount = new Set(repositories.map((repository) => repository.owner.login)).size
const providerCounts = new Map(integrationRules.map(([name]) => [name, 0]))
for (const scan of activeScanned) {
  for (const provider of scan.providers) providerCounts.set(provider, providerCounts.get(provider) + 1)
}

const privateIds = new Map(
  scans
    .filter((scan) => scan.repository.isPrivate)
    .sort((a, b) => a.repository.nameWithOwner.localeCompare(b.repository.nameWithOwner))
    .map((scan, index) => [scan.repository.nameWithOwner, `private-${String(index + 1).padStart(3, '0')}`]),
)
const gitDirectory = command('git', ['rev-parse', '--absolute-git-dir'])
const privateResolverPath = resolve(gitDirectory, 'superagents-estate-private-map.json')
writeFileSync(privateResolverPath, `${JSON.stringify({
  asOf: new Date().toISOString(),
  repositories: scans
    .filter((scan) => scan.repository.isPrivate)
    .map((scan) => ({
      id: privateIds.get(scan.repository.nameWithOwner),
      nameWithOwner: scan.repository.nameWithOwner,
      url: scan.repository.url,
      instructionGap: Boolean(scan.agentic && !scan.hasAgentInstructions),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
}, null, 2)}\n`, { mode: 0o600 })
chmodSync(privateResolverPath, 0o600)
const repositoryCatalog = scans
  .map((scan) => ({
    id: scan.repository.isPrivate ? privateIds.get(scan.repository.nameWithOwner) : scan.repository.nameWithOwner,
    url: scan.repository.isPrivate ? null : scan.repository.url,
    visibility: scan.repository.isPrivate ? 'private' : 'public',
    lifecycle: scan.repository.isArchived ? 'archived' : 'active',
    fork: scan.repository.isFork,
    scanState: scan.scanned ? 'tree-scanned' : scan.empty ? 'empty' : 'failed',
    documentation: Boolean(scan.hasDocumentation),
    rootReadme: Boolean(scan.hasRootReadme),
    agentic: Boolean(scan.agentic),
    agentInstructions: Boolean(scan.hasAgentInstructions),
    instructionStatus: scan.agentic ? (scan.hasAgentInstructions ? 'present' : 'gap') : 'not-applicable',
    componentClasses: Object.values(scan.componentCounts ?? {}).filter((count) => count > 0).length,
  }))
  .sort((a, b) => a.visibility.localeCompare(b.visibility) || a.id.localeCompare(b.id))

if (!existsSync(storagePolicyPath)) throw new Error('Canonical storage policy is unavailable')
const storagePolicy = readFileSync(storagePolicyPath, 'utf8')
const storagePolicyRevision = createHash('sha256').update(storagePolicy).digest('hex').slice(0, 16)
const detectedHost = command('hostname', ['-s']).toLowerCase()
// SUPERAGENTS_DEVICE_ID is canonical; retain the former name for one migration window.
const detectedDeviceId = process.env.SUPERAGENTS_DEVICE_ID || process.env.INNEROS_DEVICE_ID
  || (/office[- ]?mini/.test(detectedHost) ? 'main-mac-mini' : /studio/.test(detectedHost) ? 'studio-mac-mini' : /macbook/.test(detectedHost) ? 'macbook' : null)
const policyDeviceRows = [...storagePolicy.matchAll(/^\| \*\*(Mac mini \(main, here\)|Mac mini \(studio\)|MacBook \(laptop, on-the-go\))\*\* \| ([^|]+) \| ([^|]+) \|$/gm)]
const devices = policyDeviceRows.map(([, policyTitle, role, localState]) => {
  const id = policyTitle.startsWith('Mac mini (main')
    ? 'main-mac-mini'
    : policyTitle.startsWith('Mac mini (studio')
      ? 'studio-mac-mini'
      : 'macbook'
  const title = id === 'main-mac-mini' ? 'Mac mini (main)' : id === 'studio-mac-mini' ? 'Mac mini (studio)' : 'MacBook'
  const directlyVerified = id === detectedDeviceId
  const studioException = id === 'studio-mac-mini'
    ? ' The same policy explicitly excepts active Ableton sessions, which may use the studio SSD as the fast working disk.'
    : ''
  return {
    id,
    title,
    role: role.trim(),
    localState: localState.trim(),
    state: directlyVerified ? 'directly verified' : 'policy-declared · not remotely attested',
    evidence: directlyVerified
      ? `Canonical policy: ${localState.trim()}. Local repositories, runtime configuration, Hermes scheduler state, and source availability were inspected on this host.`
      : `Canonical policy: ${localState.trim()}.${studioException} This audit did not execute on that host.`,
  }
})
if (devices.length !== 3) throw new Error(`Expected 3 devices in canonical storage policy; found ${devices.length}`)

let hermesJobs = { total: 0, enabled: 0, paused: 0 }
const hermesJobsPath = join(hermesRoot, 'cron', 'jobs.json')
if (existsSync(hermesJobsPath)) {
  const jobs = JSON.parse(readFileSync(hermesJobsPath, 'utf8')).jobs ?? []
  hermesJobs = {
    total: jobs.length,
    enabled: jobs.filter((job) => job.enabled).length,
    paused: jobs.filter((job) => !job.enabled).length,
  }
}

const icloudPath = join(userHome, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
const icloudTopLevelDirectories = existsSync(icloudPath)
  ? readdirSync(icloudPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
  : 0

const report = {
  schemaVersion: 1,
  asOf: new Date().toISOString(),
  scope: 'All repositories accessible to the authenticated GitHub account through ownership, organization membership, or collaboration were scanned by tree and selected documentation/configuration surfaces. Results published here are sanitized; private names, private content, and credentials were not copied.',
  repositoryEstate: {
    total: repositories.length,
    ownersAndOrganizations: repositoryOwnerCount,
    active: repositories.filter((repository) => !repository.isArchived).length,
    archived: repositories.filter((repository) => repository.isArchived).length,
    private: repositories.filter((repository) => repository.isPrivate).length,
    public: repositories.filter((repository) => !repository.isPrivate).length,
    forks: repositories.filter((repository) => repository.isFork).length,
    repositoriesAccountedFor: scanned.length + scans.filter((scan) => scan.empty).length,
    treesScanned: scanned.length,
    emptyRepositories: scans.filter((scan) => scan.empty).length,
    scanFailures: scans.filter((scan) => !scan.scanned && !scan.empty).length,
    truncatedTrees: scans.filter((scan) => scan.truncated).length,
    declarationFilesSelected: scanned.reduce((total, scan) => total + scan.declarationFilesSelected, 0),
    declarationFilesScanned: scanned.reduce((total, scan) => total + scan.declarationFilesScanned, 0),
    declarationFilesFailed: scanned.reduce((total, scan) => total + scan.declarationFilesFailed, 0),
  },
  documentationCoverage: {
    repositoriesWithDocumentation: scanned.filter((scan) => scan.hasDocumentation).length,
    repositoriesWithRootReadme: scanned.filter((scan) => scan.hasRootReadme).length,
    repositoriesWithDocsDirectory: scanned.filter((scan) => scan.hasDocsDirectory).length,
    repositoriesWithAgentInstructions: scanned.filter((scan) => scan.hasAgentInstructions).length,
    repositoriesWithWorkflows: scanned.filter((scan) => scan.workflowDefinitions > 0).length,
    totalDocumentationFiles: scanned.reduce((total, scan) => total + scan.documentationFiles, 0),
    agenticRepositories: agentic.length,
    agenticRepositoriesWithInstructions: agentic.filter((scan) => scan.hasAgentInstructions).length,
    activeRepositoriesWithDocumentation: activeScanned.filter((scan) => scan.hasDocumentation).length,
    activeRepositoriesWithRootReadme: activeScanned.filter((scan) => scan.hasRootReadme).length,
    activeRepositoriesWithAgentInstructions: activeScanned.filter((scan) => scan.hasAgentInstructions).length,
    activeAgenticRepositories: activeAgentic.length,
    activeAgenticRepositoriesWithInstructions: activeAgentic.filter((scan) => scan.hasAgentInstructions).length,
  },
  localCoverage: {
    checkoutDirectories: local.length,
    uniqueGithubRemotes: uniqueLocalRemotes.size,
    ownedGithubRemotes: ownedLocalRemotes.size,
    estateGithubRemotes: estateLocalRemotes.size,
    externalGithubRemotes: [...uniqueLocalRemotes].filter((remote) => !accessibleGithubRemotes.has(remote.toLowerCase())).length,
    duplicateCheckoutDirectories: local.length - uniqueLocalRemotes.size,
    ownedCheckoutsOutsideCodeRoot: local.filter((checkout) => checkout.remote?.startsWith(`${owner}/`) && !checkout.path.startsWith(`${codeRoot}/`)).length,
  },
  repositoryCatalog,
  devicePolicy: {
    source: 'STORAGE_SYSTEM.md',
    revision: storagePolicyRevision,
    deviceRowsParsed: devices.length,
  },
  devices,
  sourceSurfaces: [
    ['GitHub', 'Code and shipped documentation', 'live-scanned', `${repositories.length} accessible repositories across ${repositoryOwnerCount} owners or organizations; ${scanned.length} trees scanned`],
    ['Context control plane', 'Automation registry and evidence', existsSync(join(contextRoot, 'docs', 'systems_inventory.json')) ? 'live-local' : 'missing', 'Generated inventory, contracts, and fleet evidence'],
    ['Knowledge vault', 'Curated context and durable knowledge', existsSync(join(vaultRoot, '.git')) ? 'live-local' : 'missing', 'Private Git-backed vault; content remains private'],
    ['Hermes state', 'Profiles, schedules, skills, and delivery state', existsSync(hermesJobsPath) ? 'live-local' : 'missing', `${hermesJobs.total} jobs; ${hermesJobs.enabled} enabled; ${hermesJobs.paused} paused`],
    ['Google Drive', 'Default file and data store', 'policy-declared · not live-listed', 'Connector/API or web is authoritative; Drive Desktop and rclone are unavailable on this host'],
    ['iCloud', 'Apple-native data', existsSync(icloudPath) ? 'host-visible' : 'unavailable', `${icloudTopLevelDirectories} top-level host-visible directories; content not enumerated`],
    ['1Password', 'Credentials', 'policy-declared · intentionally not enumerated', 'Only references and access contracts may be documented'],
    ['External SSD', 'Cold backup and archive', existsSync(externalSsdPath) ? 'mounted · excluded from active scan' : 'unmounted · correctly non-required on this host', 'Not an agent-runtime or repository dependency; canonical policy retains a studio-mini active-Ableton exception'],
    ['Vercel', 'Documentation deployment', 'not verified for this snapshot', 'Production verification is performed after deployment and recorded in GitHub against the commit and deployment'],
  ],
  integrationFingerprints: [...providerCounts.entries()]
    .filter(([, count]) => count > 0)
    .map(([name, activeRepositoryReferences]) => ({ name, activeRepositoryReferences })),
  agenticComponents: agenticComponentRules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    definition: rule.definition,
    allRepositories: agentic.filter((scan) => scan.scanned && (scan.componentCounts?.[rule.id] ?? 0) > 0).length,
    allFiles: agentic.filter((scan) => scan.scanned).reduce((total, scan) => total + (scan.componentCounts?.[rule.id] ?? 0), 0),
    activeRepositories: activeAgentic.filter((scan) => scan.scanned && (scan.componentCounts?.[rule.id] ?? 0) > 0).length,
    activeFiles: activeAgentic.filter((scan) => scan.scanned).reduce((total, scan) => total + (scan.componentCounts?.[rule.id] ?? 0), 0),
    publicExamples: agentic
      .filter((scan) => scan.scanned && !scan.repository.isPrivate)
      .flatMap((scan) => (scan.componentSamples?.[rule.id] ?? []).map((path) => `${scan.repository.nameWithOwner}:${path}`))
      .slice(0, 3),
  })),
  limitations: [
    'A repository tree and selected declaration files prove discoverability, not documentation quality or runtime correctness.',
    'The studio Mac mini and MacBook remain policy-declared until the same verifier runs on those hosts.',
    'Google Drive, iCloud content, 1Password items, customer data, inboxes, and financial records were not content-scanned.',
    'Integration fingerprints indicate references in active repositories; they do not prove that credentials are configured or the service is healthy.',
    'Agentic component rows are candidate path signals within high-confidence agentic repositories. Categories intentionally overlap and path matching can still produce false positives or miss unconventional layouts.',
    'The current published tree is sanitized. Legacy public Git history predates these controls and remains a known privacy-hardening gap tracked in GitHub issue #4.',
  ],
}

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Estate audit written: ${report.repositoryEstate.treesScanned}/${report.repositoryEstate.total} repository trees scanned; ${report.repositoryEstate.declarationFilesScanned}/${report.repositoryEstate.declarationFilesSelected} declaration files inspected; ${report.integrationFingerprints.length} integration classes detected.`)
console.log('Private repository resolver written with mode 0600 under local Git metadata.')
