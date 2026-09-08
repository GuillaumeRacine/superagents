import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type { MetadataRoute } from 'next'
import registry from '../config/system-registry.json'

const appRoot = resolve(process.cwd(), 'app')
const siteUrl = 'https://inneros-docs.vercel.app'

function pageRoutes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) return pageRoutes(fullPath)
    if (entry.name !== 'page.mdx') return []

    const routeDirectory = relative(appRoot, dirname(fullPath))
    return [routeDirectory ? `/${routeDirectory}` : '/']
  })
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(registry.asOf)

  return pageRoutes(appRoot).sort().map((route) => ({
    url: `${siteUrl}${route === '/' ? '' : route}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: route === '/' ? 1 : route.startsWith('/start-here') ? 0.9 : 0.7,
  }))
}
