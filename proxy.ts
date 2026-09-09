import { auth } from '@/auth'
import { isAllowedEmail } from '@/lib/access-policy.mjs'
import { NextResponse } from 'next/server'

// This is a secondary gate for the rendered site, not a confidentiality boundary
// for the public GitHub source. Published content must remain sanitized.

export const config = {
  // Auth.js owns /api/auth. Pagefind and machine-readable navigation remain
  // public because they mirror this already-public, sanitized repository.
  matcher: ['/((?!api/auth|_next/static|_next/image|_pagefind|favicon.ico|robots.txt|sitemap.xml).*)'],
}

function protectedResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('Vary', 'Cookie')
  return response
}

export const proxy = auth((req) => {
  if (isAllowedEmail(req.auth?.user?.email)) {
    return protectedResponse(NextResponse.next())
  }

  const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin)
  signInUrl.searchParams.set('callbackUrl', `${req.nextUrl.pathname}${req.nextUrl.search}`)
  return protectedResponse(NextResponse.redirect(signInUrl))
})
