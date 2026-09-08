import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = process.cwd()
const inputPath = resolve(root, 'config/estate-coverage.json')
const report = JSON.parse(readFileSync(inputPath, 'utf8'))
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
const number = (value) => new Intl.NumberFormat('en-CA').format(value)
const yesNo = (value) => value ? 'yes' : 'no'
const snapshot = new Date(report.asOf).toLocaleString('en-CA', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Toronto',
})

const estateRows = [
  ['Accessible GitHub repositories', report.repositoryEstate.total],
  ['Owners and organizations represented', report.repositoryEstate.ownersAndOrganizations],
  ['Active repositories', report.repositoryEstate.active],
  ['Archived repositories', report.repositoryEstate.archived],
  ['Non-empty repository trees scanned', report.repositoryEstate.treesScanned],
  ['Empty repositories', report.repositoryEstate.emptyRepositories],
  ['Repository scan failures', report.repositoryEstate.scanFailures],
  ['Declaration files selected', report.repositoryEstate.declarationFilesSelected],
  ['Declaration files inspected', report.repositoryEstate.declarationFilesScanned],
  ['Declaration file read failures', report.repositoryEstate.declarationFilesFailed],
  ['Agentic component classes', report.agenticComponents.length],
  ['Declared operating devices', report.devices.length],
  ['Directly verified devices', report.devices.filter((device) => device.state === 'directly verified').length],
]
  .map(([label, value]) => `| ${label} | ${number(value)} |`)
  .join('\n')

const overview = `# Estate Coverage

> Generated from \`config/estate-coverage.json\`. The GitHub estate scan ran **${snapshot}**.

**Scope:** ${report.scope}

This section answers four separate questions without conflating them: what exists, which agentic components are discoverable, what has documentation, and what was directly verified on a device.

| Coverage dimension | Count |
|---|---:|
${estateRows}

## Navigate the estate

- [Agentic Components](/estate/components) — the complete repository-discoverable component taxonomy, from instructions and skills through orchestration and proof
- [Repositories](/estate/repositories) — every accessible GitHub repository, local checkout coverage, and documentation signals
- [Devices & Hosts](/estate/devices) — which machines are declared versus directly attested
- [Data Sources & Integrations](/estate/data-sources) — canonical storage surfaces and repository-level service fingerprints

## What “complete” means here

- **Repository-complete:** all ${number(report.repositoryEstate.total)} repositories accessible through ownership, organization membership, or collaboration were enumerated; ${number(report.repositoryEstate.treesScanned)} non-empty trees were scanned and ${number(report.repositoryEstate.emptyRepositories)} repositories were empty.
- **Current-tree sanitized:** private names, private content, credentials, customer records, messages, and financial data were not copied into the current published tree. Legacy Git history predates these controls and is tracked as a hardening gap.
- **Device-honest:** only the main Mac mini is directly verified. The other declared devices remain visible as coverage gaps until the same audit runs there.
- **Evidence-aware:** a file or service reference proves discoverability, not correctness, authorization, freshness, or documentation quality.
`

const repositorySummaryRows = [
  ['Total accessible', report.repositoryEstate.total],
  ['Owners and organizations', report.repositoryEstate.ownersAndOrganizations],
  ['Active', report.repositoryEstate.active],
  ['Archived', report.repositoryEstate.archived],
  ['Private', report.repositoryEstate.private],
  ['Public', report.repositoryEstate.public],
  ['Forks', report.repositoryEstate.forks],
  ['Accounted for', report.repositoryEstate.repositoriesAccountedFor],
  ['Non-empty trees scanned', report.repositoryEstate.treesScanned],
  ['Empty repositories', report.repositoryEstate.emptyRepositories],
  ['Scan failures', report.repositoryEstate.scanFailures],
  ['Truncated trees', report.repositoryEstate.truncatedTrees],
  ['Declaration files selected', report.repositoryEstate.declarationFilesSelected],
  ['Declaration files inspected', report.repositoryEstate.declarationFilesScanned],
  ['Declaration file read failures', report.repositoryEstate.declarationFilesFailed],
]
  .map(([label, value]) => `| ${label} | ${number(value)} |`)
  .join('\n')

const documentationRows = [
  ['Repositories with documentation', report.documentationCoverage.repositoriesWithDocumentation],
  ['Repositories with a root README', report.documentationCoverage.repositoriesWithRootReadme],
  ['Repositories with a docs directory', report.documentationCoverage.repositoriesWithDocsDirectory],
  ['Repositories with agent instructions', report.documentationCoverage.repositoriesWithAgentInstructions],
  ['Repositories with GitHub workflows', report.documentationCoverage.repositoriesWithWorkflows],
  ['Documentation files discovered', report.documentationCoverage.totalDocumentationFiles],
  ['Agentic repositories', report.documentationCoverage.agenticRepositories],
  ['Agentic repositories with instructions', report.documentationCoverage.agenticRepositoriesWithInstructions],
  ['Active repositories with documentation', report.documentationCoverage.activeRepositoriesWithDocumentation],
  ['Active repositories with a root README', report.documentationCoverage.activeRepositoriesWithRootReadme],
  ['Active repositories with agent instructions', report.documentationCoverage.activeRepositoriesWithAgentInstructions],
  ['Active agentic repositories', report.documentationCoverage.activeAgenticRepositories],
  ['Active agentic repositories with instructions', report.documentationCoverage.activeAgenticRepositoriesWithInstructions],
]
  .map(([label, value]) => `| ${label} | ${number(value)} |`)
  .join('\n')

const renderRepositoryRows = (entries) => entries
  .map((entry) => {
    const id = entry.url ? `[${escapeCell(entry.id)}](${entry.url})` : `\`${escapeCell(entry.id)}\``
    const instructions = entry.instructionStatus === 'gap' ? '**gap**' : entry.instructionStatus
    return `| ${id} | ${entry.visibility} | ${entry.lifecycle} | ${entry.scanState} | ${yesNo(entry.documentation)} | ${yesNo(entry.agentic)} | ${instructions} | ${number(entry.componentClasses)} |`
  })
  .join('\n')
const publicRepositoryRows = renderRepositoryRows(report.repositoryCatalog.filter((entry) => entry.visibility === 'public'))
const privateRepositoryRows = renderRepositoryRows(report.repositoryCatalog.filter((entry) => entry.visibility === 'private'))

const localRows = [
  ['Checkout directories', report.localCoverage.checkoutDirectories],
  ['Unique GitHub remotes', report.localCoverage.uniqueGithubRemotes],
  ['Authenticated-estate GitHub remotes', report.localCoverage.estateGithubRemotes],
  ['Personal-owner GitHub remotes', report.localCoverage.ownedGithubRemotes],
  ['External GitHub remotes', report.localCoverage.externalGithubRemotes],
  ['Duplicate/worktree checkout directories', report.localCoverage.duplicateCheckoutDirectories],
  ['Personal-owner checkouts outside the internal code root', report.localCoverage.ownedCheckoutsOutsideCodeRoot],
]
  .map(([label, value]) => `| ${label} | ${number(value)} |`)
  .join('\n')

const repositoriesPage = `# Repository Coverage

> Snapshot: **${snapshot}**. Generated from the authenticated GitHub account inventory and repository trees.

## GitHub estate

| Measurement | Count |
|---|---:|
${repositorySummaryRows}

All ${number(report.repositoryEstate.total)} repositories accessible through ownership, organization membership, or collaboration were accounted for. The difference between total repositories and scanned trees is explained by empty repositories, not silent scan failures.

## Documentation signals

| Signal | Count |
|---|---:|
${documentationRows}

These are structural signals. A README or instructions file can still be stale, incomplete, or incorrect; each active project remains responsible for its own source-of-truth documentation and deployment proof.

## Public repositories

Public repository names link directly to GitHub.

| Repository | Visibility | Lifecycle | Tree | Docs | Agentic | Instructions | Component classes |
|---|---|---|---|---|---|---|---:|
${publicRepositoryRows}

## Private repositories

Private repositories use snapshot-scoped opaque IDs because this source repository is public; their names and URLs are intentionally absent.

| Repository | Visibility | Lifecycle | Tree | Docs | Agentic | Instructions | Component classes |
|---|---|---|---|---|---|---|---:|
${privateRepositoryRows}

## Local checkout coverage

| Measurement | Count |
|---|---:|
${localRows}

Multiple checkout directories primarily represent worktrees or deliberate parallel work. Remote-only repositories are cloned into internal storage on demand; the external SSD is not an active repository source.

## Material documentation gap

${number(report.documentationCoverage.activeAgenticRepositories - report.documentationCoverage.activeAgenticRepositoriesWithInstructions)} active repositories with high-confidence agentic signals do not expose a recognized AGENTS.md, CLAUDE.md, GEMINI.md, GROK.md, or CODEX.md instruction file. The catalog marks every affected row as **gap** without publishing private names.
`

const componentRows = report.agenticComponents
  .map((component) => {
    const examples = component.publicExamples.length
      ? component.publicExamples.map((example) => `\`${escapeCell(example)}\``).join('<br />')
      : 'No public example in this snapshot'
    return `| ${escapeCell(component.title)} | ${escapeCell(component.definition)} | ${number(component.allRepositories)} | ${number(component.allFiles)} | ${number(component.activeRepositories)} | ${number(component.activeFiles)} | ${examples} |`
  })
  .join('\n')

const componentsPage = `# Agentic Components

> Snapshot: **${snapshot}**. Generated from high-confidence agentic repositories; candidate path categories intentionally overlap.

This taxonomy lists every class of repository-discoverable agentic component the scanner recognizes. It covers declarative policy, executable capabilities, control-plane wiring, context, orchestration, scheduled work, integrations, and verification evidence.

| Component class | What belongs here | Agentic repos | Candidate files | Active repos | Active candidate files | Public evidence samples |
|---|---|---:|---:|---:|---:|---|
${componentRows}

## How to read the inventory

- Counts are candidate structural signals inside repositories first classified as agentic by strong signals such as agent instructions, definitions, skills, commands, prompts, MCPs, plugins, profiles, or repository identity.
- Samples make representative public matches reviewable; private paths remain private. Path heuristics can still misclassify a file or miss an unconventional layout.
- Counts do not claim that a component is enabled, current, authorized, or healthy.
- A file can belong to more than one class, so rows must not be summed.
- Archived repositories remain visible in the all-repository columns; active columns isolate the operating estate.
- Runtime-installed capabilities that are not committed to a repository are covered separately by the [Capability Inventory](/reference/capability-inventory).

Use [Repository Coverage](/estate/repositories) for estate-wide documentation gaps and [Systems Registry](/reference/system-registry) for the currently verified operating systems.
`

const deviceRows = report.devices
  .map((device) => `| ${escapeCell(device.title)} | ${escapeCell(device.role)} | ${escapeCell(device.state)} | ${escapeCell(device.evidence)} |`)
  .join('\n')

const devicesPage = `# Devices & Hosts

> Snapshot: **${snapshot}**. Device declarations were parsed from the canonical storage policy revision \`${report.devicePolicy.revision}\`; verification state comes from this audit run.

| Device | Role | Verification | Evidence |
|---|---|---|---|
${deviceRows}

## Coverage rule

A device is **directly verified** only when the estate and runtime checks execute on that host. Git synchronization or a policy entry does not prove installed versions, local skills, active services, browser sessions, or scheduler state.

The main Mac mini currently owns the live runtime snapshot. The studio Mac mini and MacBook are documented so they cannot disappear from the architecture, but their agentic configuration is not claimed as current.

## Cross-device source ownership

- GitHub synchronizes code and shipped documentation.
- The private vault synchronizes curated knowledge through Git.
- Google Drive is the device-independent source for files and datasets.
- iCloud owns Apple-native data.
- 1Password owns credentials.
- Local runtime caches, sessions, and installed versions remain device-specific and require host-level verification.
- The external SSD is cold storage for normal agent and repository operation. The canonical policy explicitly retains one exception: active Ableton sessions on the studio Mac mini may use its SSD as a fast working disk.
`

const sourceRows = report.sourceSurfaces
  .map(([source, role, state, evidence]) => `| ${escapeCell(source)} | ${escapeCell(role)} | ${escapeCell(state)} | ${escapeCell(evidence)} |`)
  .join('\n')
const integrationRows = [...report.integrationFingerprints]
  .sort((a, b) => b.activeRepositoryReferences - a.activeRepositoryReferences || a.name.localeCompare(b.name))
  .map((entry) => `| ${escapeCell(entry.name)} | ${number(entry.activeRepositoryReferences)} |`)
  .join('\n')
const limitationItems = report.limitations.map((limitation) => `- ${limitation}`).join('\n')

const dataSourcesPage = `# Data Sources & Integrations

> Snapshot: **${snapshot}**. This page distinguishes canonical data ownership from references found in repository declarations.

## Canonical source surfaces

| Source | Role | Audit state | Evidence boundary |
|---|---|---|---|
${sourceRows}

## Integration fingerprints across active repositories

The scanner inspected ${number(report.repositoryEstate.declarationFilesScanned)} selected README, package, environment-example, architecture, and integration files. Counts show how many active repositories reference each integration class.

| Integration class | Active repository references |
|---|---:|
${integrationRows}

A reference is a discovery signal, not proof that credentials exist, data is fresh, or the integration is healthy. Operational status remains with the owning repository, provider, or control-plane evidence.

## Protected boundaries

${limitationItems}
`

const outputs = [
  [resolve(root, 'app/estate/page.mdx'), overview],
  [resolve(root, 'app/estate/components/page.mdx'), componentsPage],
  [resolve(root, 'app/estate/repositories/page.mdx'), repositoriesPage],
  [resolve(root, 'app/estate/devices/page.mdx'), devicesPage],
  [resolve(root, 'app/estate/data-sources/page.mdx'), dataSourcesPage],
]

if (process.argv.includes('--check')) {
  const stale = outputs.filter(([outputPath, content]) => !existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== content)
  if (stale.length) {
    console.error(`Generated estate documentation is stale: ${stale.map(([outputPath]) => outputPath).join(', ')}. Run npm run docs:generate.`)
    process.exit(1)
  }
  console.log('Generated estate documentation is current.')
} else {
  for (const [outputPath, content] of outputs) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, content)
    console.log(`Wrote ${outputPath}`)
  }
}
