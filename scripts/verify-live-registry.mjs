import { execFileSync } from 'node:child_process'
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
]

const failures = checks.filter(([, actual, expected]) => String(actual) !== String(expected))
for (const [label, actual, expected] of checks) {
  console.log(`${failures.some(([failed]) => failed === label) ? 'FAIL' : 'PASS'} ${label}: live=${actual} registry=${expected}`)
}
if (failures.length) process.exit(1)

console.log(`Live registry verification passed: ${checks.length} measurements match the ${registry.asOf} snapshot.`)
