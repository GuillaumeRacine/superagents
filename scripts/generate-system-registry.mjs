import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const registryPath = resolve(root, 'config/system-registry.json')
const registryOutputPath = resolve(root, 'app/reference/system-registry/page.mdx')
const capabilityPath = resolve(root, 'config/capability-inventory.json')
const capabilityOutputPath = resolve(root, 'app/reference/capability-inventory/page.mdx')
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
const capabilityInventory = JSON.parse(readFileSync(capabilityPath, 'utf8'))

const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
const label = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const counts = (entry) => {
  const pairs = Object.entries(entry.counts ?? {})
  return pairs.length ? pairs.map(([key, value]) => `${label(key)}: ${value}`).join('; ') : 'No volatile count published'
}

const summaryRows = registry.systems
  .map((entry) => `| [${escapeCell(entry.title)}](${entry.route}) | ${escapeCell(entry.kind)} | ${escapeCell(entry.status)} | ${escapeCell(entry.lastVerified)} |`)
  .join('\n')

const detailSections = registry.systems
  .map((entry) => `## ${entry.title}\n\n**Status:** ${entry.status}\n\n**Version:** ${entry.version}\n\n**Owner:** ${entry.owner}\n\n**Last verified:** ${entry.lastVerified}\n\n| Contract | Value |\n|---|---|\n| Source of truth | ${escapeCell(entry.source)} |\n| Measurement | ${escapeCell(entry.measurement)} |\n| Trigger | ${escapeCell(entry.trigger)} |\n| Permissions | ${escapeCell(entry.permissions)} |\n| Inputs | ${escapeCell(entry.inputs)} |\n| Outputs | ${escapeCell(entry.outputs)} |\n| Proof | ${escapeCell(entry.proof)} |\n| Recovery | ${escapeCell(entry.recovery)} |\n| Snapshot counts | ${escapeCell(counts(entry))} |`)
  .join('\n\n')

const generated = `# System Registry\n\n> Generated from \`config/system-registry.json\`. Do not edit this page directly.\n\n**Snapshot:** ${registry.asOf}\n\n**Scope:** ${registry.scope}\n\nThis registry is a **derived index**, not a replacement for each runtime's source of truth. A scheduler reporting success is not independent proof that its outcome was correct.\n\n| System | Kind | Status | Last verified |\n|---|---|---|---|\n${summaryRows}\n\n${detailSections}\n`

const inventoryRows = capabilityInventory.inventories
  .map((entry) => `| [${escapeCell(entry.title)}](#${slug(entry.title)}) | ${escapeCell(entry.runtime)} | ${entry.count} | ${escapeCell(entry.detailLevel)} | ${escapeCell(entry.state)} |`)
  .join('\n')

const inventorySections = capabilityInventory.inventories
  .map((entry) => {
    const items = entry.items
      .map(([name, purpose]) => `| ${escapeCell(name)} | ${escapeCell(purpose)} |`)
      .join('\n')
    return `## ${entry.title}\n\n**Runtime:** ${entry.runtime}\n\n**State:** ${entry.state}\n\n**Published count:** ${entry.count}\n\n**Detail level:** ${entry.detailLevel}\n\n**Source:** ${entry.source}\n\n**Counting rule:** ${entry.countingRule}\n\n| Capability or group | Purpose or state |\n|---|---|\n${items}`
  })
  .join('\n\n')

const generatedCapabilities = `# Capability Inventory\n\n> Generated from \`config/capability-inventory.json\`. Do not edit this page directly.\n\n**Snapshot:** ${capabilityInventory.asOf}\n\n**Scope:** ${capabilityInventory.scope}\n\nThis is the complete **sanitized** capability map. Exact private agent and job catalogs remain with their owning runtime because this source repository is public.\n\n| Inventory | Runtime | Count | Detail | State |\n|---|---|---|---|---|\n${inventoryRows}\n\n${inventorySections}\n`

const outputs = [
  [registryOutputPath, generated],
  [capabilityOutputPath, generatedCapabilities],
]

if (process.argv.includes('--check')) {
  const stale = outputs.filter(([outputPath, content]) => readFileSync(outputPath, 'utf8') !== content)
  if (stale.length) {
    console.error(`Generated documentation is stale: ${stale.map(([outputPath]) => outputPath).join(', ')}. Run npm run docs:generate.`)
    process.exit(1)
  }
  console.log('Generated system registry and capability inventory are current.')
} else {
  for (const [outputPath, content] of outputs) {
    writeFileSync(outputPath, content)
    console.log(`Wrote ${outputPath}`)
  }
}
