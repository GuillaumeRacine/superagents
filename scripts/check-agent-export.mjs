import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? files(path) : entry.name === 'page.mdx' ? [path] : []
})
const markdown = readFileSync('public/superagents.md', 'utf8')
const pages = files('app')
const anchors = [...markdown.matchAll(/^<a id="(page-[a-f0-9]+)"><\/a>$/gm)].map((m) => m[1])
assert.equal(anchors.length, pages.length)
assert.equal(new Set(anchors).size, pages.length)
assert.equal((markdown.match(/^\d+\. \[/gm) ?? []).length >= pages.length, true)
for (const file of pages) {
  const route = '/' + relative('app', dirname(file))
  const anchor = `page-${Buffer.from(route).toString('hex')}`
  assert(anchors.includes(anchor), `Missing anchor for ${route}`)
  assert(markdown.includes(`](#${anchor}) — \`${route}\``), `Missing TOC entry for ${route}`)
  assert(markdown.includes(`| \`${file}\` |`), `Missing source index for ${file}`)
  assert(markdown.includes(readFileSync(file, 'utf8').trim()), `Page content omitted: ${file}`)
}
assert.equal((markdown.match(/^\[Back to table of contents\]/gm) ?? []).length, pages.length)
console.log(`PASS: ${pages.length} complete pages, unique anchors, TOC, source index and return links.`)
