import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import registry from '../config/system-registry.json' with { type: 'json' }

const root = process.cwd()
const appRoot = resolve(root, 'app')
const publicRoot = resolve(root, 'public')
const siteUrl = 'https://superagents-docs.vercel.app'
const checkOnly = process.argv.includes('--check')

function pageFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) return pageFiles(fullPath)
    return entry.name === 'page.mdx' ? [fullPath] : []
  })
}

function routeFor(file) {
  const routeDirectory = relative(appRoot, dirname(file))
  return routeDirectory ? `/${routeDirectory}` : '/'
}

function titleFor(content, route) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '') ?? route
}

const pages = pageFiles(appRoot)
  .map((file) => {
    const content = readFileSync(file, 'utf8').trim()
    const route = routeFor(file)
    return {
      content,
      file: relative(root, file),
      route,
      title: titleFor(content, route),
      url: `${siteUrl}${route === '/' ? '' : route}`,
    }
  })
  .sort((a, b) => a.route.localeCompare(b.route))

const markdown = [
  '# Super Agents — Complete Documentation Export',
  '',
  '> Generated from every canonical documentation page in the Super Agents repository.',
  '',
  `- Canonical site: ${siteUrl}`,
  '- Source: https://github.com/GuillaumeRacine/superagents',
  `- Registry snapshot: ${registry.asOf}`,
  `- Pages included: ${pages.length}`,
  '',
  'This file is generated. Edit the owning page in `app/`, then run `npm run docs:generate`.',
  '',
  ...pages.flatMap((page) => [
    '---',
    '',
    `<!-- source-page: ${page.file} | route: ${page.url} -->`,
    '',
    `Source page: [${page.title}](${page.url})`,
    '',
    page.content,
    '',
  ]),
].join('\n')

const llms = [
  '# Super Agents',
  '',
  '> A sanitized, evidence-backed map of Gui\'s complete agentic operating environment.',
  '',
  '## Complete export',
  '',
  `- [Complete Markdown documentation](${siteUrl}/superagents.md): One generated file containing all ${pages.length} canonical pages.`,
  `- [XML sitemap](${siteUrl}/sitemap.xml): Machine-readable list of canonical website routes.`,
  '- [GitHub source](https://github.com/GuillaumeRacine/superagents): Versioned source and generation scripts.',
  '',
  '## Documentation pages',
  '',
  ...pages.map((page) => `- [${page.title}](${page.url})`),
  '',
].join('\n')

function writeOrCheck(filename, expected) {
  const path = join(publicRoot, filename)
  if (checkOnly) {
    let current = null
    try {
      current = readFileSync(path, 'utf8')
    } catch {
      // Report the missing generated file below.
    }
    if (current !== expected) {
      console.error(`${filename} is stale. Run npm run docs:generate.`)
      process.exitCode = 1
    }
    return
  }
  mkdirSync(publicRoot, { recursive: true })
  writeFileSync(path, expected)
}

writeOrCheck('superagents.md', markdown)
writeOrCheck('llms.txt', llms)

if (!process.exitCode) {
  console.log(`${checkOnly ? 'Verified' : 'Generated'} agent exports for ${pages.length} documentation pages.`)
}
