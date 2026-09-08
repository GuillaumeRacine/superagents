import { NextRequest, NextResponse } from 'next/server'

// This is a secondary gate for the rendered site, not a confidentiality boundary
// for the public GitHub source. Published content must remain sanitized.

export const config = {
  // Pagefind runs in a web worker that cannot reliably reuse HTTP Basic
  // credentials. Its index mirrors this already-public, sanitized repository.
  matcher: ['/((?!_next/static|_next/image|_pagefind|favicon.ico|robots.txt|sitemap.xml).*)'],
}

function unauthorized() {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Authorization',
      'WWW-Authenticate': 'Basic realm="InnerOS Docs", charset="UTF-8"',
    },
  })
}

export function proxy(req: NextRequest) {
  // Preserve the established production contract: deployments may configure
  // only DOCS_PASSWORD, in which case the username remains "gui".
  const expectedUser = process.env.DOCS_USER || 'gui'
  const expectedPass = process.env.DOCS_PASSWORD

  if (!expectedPass) {
    return new NextResponse('Site auth not configured.', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  const header = req.headers.get('authorization')
  if (header?.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6))
      const sep = decoded.indexOf(':')
      if (sep < 1) return unauthorized()
      const user = decoded.slice(0, sep)
      const pass = decoded.slice(sep + 1)
      if (user === expectedUser && pass === expectedPass) {
        const response = NextResponse.next()
        response.headers.set('Cache-Control', 'private, no-store, max-age=0')
        response.headers.set('Vary', 'Authorization')
        return response
      }
    } catch {
      // fall through to 401
    }
  }
  return unauthorized()
}
