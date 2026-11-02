import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const root = process.cwd()
const home = homedir()
const registry = JSON.parse(readFileSync(resolve(root, 'config/system-registry.json'), 'utf8'))
const capabilityInventory = JSON.parse(readFileSync(resolve(root, 'config/capability-inventory.json'), 'utf8'))
const byId = Object.fromEntries(registry.systems.map((system) => [system.id, system]))
const capabilityById = Object.fromEntries(capabilityInventory.inventories.map((inventory) => [inventory.id, inventory]))

function run(command, args = []) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function entries(directory) {
  return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : []
}

function countFiles(directory, predicate) {
  return entries(directory).reduce((total, entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return total + countFiles(path, predicate)
    return total + (entry.isFile() && predicate(entry.name) ? 1 : 0)
  }, 0)
}

function directSkillState(directory) {
  const candidates = entries(directory).filter((entry) => !entry.name.startsWith('.'))
  const resolved = candidates.filter((entry) => {
    const manifest = join(directory, entry.name, 'SKILL.md')
    return existsSync(manifest) && statSync(manifest).isFile()
  })
  return { resolved: resolved.length, unresolved: candidates.length - resolved.length }
}

function countManagedPluginVersions(directory) {
  return entries(directory).filter((plugin) => {
    const pluginRoot = join(directory, plugin.name)
    return plugin.isDirectory() && entries(pluginRoot).some((version) => version.isDirectory())
  }).length
}

const codexRoot = join(home, '.codex')
const claudeRoot = join(home, '.claude')
const hermesRoot = join(home, '.hermes')
const codexSkills = directSkillState(join(codexRoot, 'skills'))
const codexConfig = readFileSync(join(codexRoot, 'config.toml'), 'utf8')
const codexMcp = new Set([...codexConfig.matchAll(/^\[mcp_servers\.([^\.\]]+)\]$/gm)].map((match) => match[1])).size
const automationFiles = entries(join(codexRoot, 'automations'))
  .map((entry) => join(codexRoot, 'automations', entry.name, 'automation.toml'))
  .filter((path) => existsSync(path))
const activeAutomations = automationFiles.filter((path) => !/^status\s*=\s*["']PAUSED["']/m.test(readFileSync(path, 'utf8'))).length
const managedPlugins = countManagedPluginVersions(join(codexRoot, 'plugins', 'cache', 'openai-curated-remote'))
  + countManagedPluginVersions(join(codexRoot, 'plugins', 'cache', 'openai-bundled'))

const claudeAgents = entries(join(claudeRoot, 'agents'))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'AGENTS_INDEX.md').length
const claudeSkills = directSkillState(join(claudeRoot, 'skills')).resolved
const installedPlugins = JSON.parse(readFileSync(join(claudeRoot, 'plugins', 'installed_plugins.json'), 'utf8')).plugins
const claudeSettings = JSON.parse(readFileSync(join(claudeRoot, 'settings.json'), 'utf8'))
const enabledPlugins = Object.values(claudeSettings.enabledPlugins ?? {}).filter(Boolean).length

const hermesJobs = JSON.parse(readFileSync(join(hermesRoot, 'cron', 'jobs.json'), 'utf8')).jobs
const hermesProfiles = entries(join(hermesRoot, 'profiles')).filter((entry) => entry.isDirectory()).length

const versions = {
  codex: run('codex', ['--version']).match(/\d+\.\d+\.\d+/)?.[0],
  claude: run('claude', ['--version']).match(/\d+\.\d+\.\d+/)?.[0],
  hermes: run('hermes', ['version']).match(/v(\d+\.\d+\.\d+)/)?.[1],
  gemini: run('gemini', ['--version']).match(/\d+\.\d+\.\d+/)?.[0],
  grok: run('grok', ['--version']).match(/\d+\.\d+\.\d+/)?.[0],
}

// Finance (MoneyOS): the record is the private repository's main. MONEYOS_REPO (owner/name) is never
// written here; when it is unset the finance rows are skipped with a warning instead of failing.
function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1 } else if (c === '"') quoted = false; else cell += c }
    else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}
const pythonJson = (value) => Array.isArray(value)
  ? `[${value.map(pythonJson).join(', ')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}: ${pythonJson(value[key])}`).join(', ')}}`
    : JSON.stringify(value)
function moneyosCounts(repository) {
  const raw = (path) => execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github.raw+json', `repos/${repository}/contents/${path}?ref=main`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const sources = JSON.parse(raw('sources.json'))
  const { next_question_id: _ignored, ...hashed } = sources
  const hash = createHash('sha256').update(raw('SOURCE_OF_TRUTH.md')).update(pythonJson(hashed)).digest('hex').slice(0, 12)
  const ackRows = raw('ACK.md').split('\n').filter((line) => line.startsWith('|') && !line.startsWith('| agent') && !line.startsWith('|---'))
    .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
  const [header, ...clarify] = csvRows(raw('clarify/to-clarify.csv'))
  const statusIndex = header.indexOf('Status')
  return {
    ledgerRows: csvRows(raw('data/ledger.csv')).length - 1,
    openToClarifyRows: clarify.filter((row) => row[statusIndex] === 'open').length,
    contractAckRows: sources.required_acks.filter((agent) => ackRows.some((row) => row[0] === agent && row[2] === hash)).length,
    contractAckRequired: sources.required_acks.length,
    version: sources.contract_version,
  }
}
const moneyos = process.env.MONEYOS_REPO ? moneyosCounts(process.env.MONEYOS_REPO) : null
if (!moneyos) console.log('WARN Finance (MoneyOS) counts skipped: set MONEYOS_REPO=owner/name on the owning workstation')

const checks = [
  ['Codex version', versions.codex, byId.codex.version],
  ['Codex usable personal skills', codexSkills.resolved, byId.codex.counts.usableTopLevelPersonalSkills],
  ['Codex unresolved skill entries', codexSkills.unresolved, byId.codex.counts.unresolvedTopLevelSkillEntries],
  ['Codex managed plugins', managedPlugins, byId.codex.counts.managedPluginInstalls],
  ['Codex MCP servers', codexMcp, byId.codex.counts.configuredMcpServers],
  ['Codex desktop automations', automationFiles.length, byId.codex.counts.desktopAutomations],
  ['Codex active desktop automations', activeAutomations, byId.codex.counts.activeDesktopAutomations],
  ['Claude version', versions.claude, byId['claude-code'].version],
  ['Claude agent definitions', claudeAgents, byId['claude-code'].counts.agentDefinitions],
  ['Claude slash commands', countFiles(join(claudeRoot, 'commands'), (name) => name.endsWith('.md')), byId['claude-code'].counts.slashCommands],
  ['Claude standalone skills', claudeSkills, byId['claude-code'].counts.standaloneSkillManifests],
  ['Claude registered plugins', Object.keys(installedPlugins).length, byId['claude-code'].counts.registeredPlugins],
  ['Claude enabled plugins', enabledPlugins, byId['claude-code'].counts.enabledPlugins],
  ['Claude path rules', countFiles(join(claudeRoot, 'rules'), (name) => name.endsWith('.md')), byId['claude-code'].counts.pathRules],
  ['Claude hook files', countFiles(join(claudeRoot, 'hooks'), () => true), byId['claude-code'].counts.hookFiles],
  ['Hermes version', versions.hermes, byId.hermes.version.match(/\d+\.\d+\.\d+/)?.[0]],
  ['Hermes profiles', hermesProfiles, byId.hermes.counts.profiles],
  ['Hermes jobs', hermesJobs.length, byId.hermes.counts.scheduledJobs],
  ['Hermes enabled jobs', hermesJobs.filter((job) => job.enabled === true).length, byId.hermes.counts.enabledJobs],
  ['Hermes paused jobs', hermesJobs.filter((job) => job.enabled !== true).length, byId.hermes.counts.pausedJobs],
  ['Hermes active user skills', countFiles(join(hermesRoot, 'skills'), (name) => name === 'SKILL.md'), byId.hermes.counts.activeUserSkillManifests],
  ['Gemini version', versions.gemini, byId['gemini-cli'].version],
  ['Grok version', versions.grok, byId['grok-cli'].version],
  ['Capability catalog: Codex personal skills', codexSkills.resolved, capabilityById['codex-personal-skills'].count],
  ['Capability catalog: Codex managed plugins', managedPlugins, capabilityById['codex-managed-plugins'].count],
  ['Capability catalog: Codex MCP', codexMcp, capabilityById['codex-mcp'].count],
  ['Capability catalog: Claude agents', claudeAgents, capabilityById['claude-agents'].count],
  ['Capability catalog: Claude commands', countFiles(join(claudeRoot, 'commands'), (name) => name.endsWith('.md')), capabilityById['claude-commands'].count],
  ['Capability catalog: Claude skills', claudeSkills, capabilityById['claude-skills'].count],
  ['Capability catalog: Claude plugins', Object.keys(installedPlugins).length, capabilityById['claude-plugins'].count],
  ['Capability catalog: Hermes profiles', hermesProfiles, capabilityById['hermes-profiles'].count],
  ['Capability catalog: Hermes jobs', hermesJobs.length, capabilityById['hermes-jobs'].count],
  ['Capability catalog: Hermes skills', countFiles(join(hermesRoot, 'skills'), (name) => name === 'SKILL.md'), capabilityById['hermes-skills'].count],
  ...(moneyos ? [
    ['Finance (MoneyOS) contract version', moneyos.version, byId['finance-moneyos'].version],
    ['Finance (MoneyOS) ledger rows', moneyos.ledgerRows, byId['finance-moneyos'].counts.ledgerRows],
    ['Finance (MoneyOS) open to-clarify rows', moneyos.openToClarifyRows, byId['finance-moneyos'].counts.openToClarifyRows],
    ['Finance (MoneyOS) ACK rows at current hash', moneyos.contractAckRows, byId['finance-moneyos'].counts.contractAckRows],
    ['Finance (MoneyOS) ACK rows required', moneyos.contractAckRequired, byId['finance-moneyos'].counts.contractAckRequired],
  ] : []),
]

const failures = checks.filter(([, actual, expected]) => String(actual) !== String(expected))
for (const [label, actual, expected] of checks) {
  console.log(`${failures.some(([failed]) => failed === label) ? 'FAIL' : 'PASS'} ${label}: live=${actual} registry=${expected}`)
}
if (failures.length) process.exit(1)

console.log(`Live registry verification passed: ${checks.length} measurements match the ${registry.asOf} snapshot.`)
