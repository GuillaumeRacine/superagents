/**
 * The allowlist contains exact server-side email addresses, never domains.
 * Google email addresses are case-insensitive, so comparison is normalized.
 */
export function isAllowedEmail(email, configuredEmails = process.env.AUTHORIZED_GOOGLE_EMAILS) {
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) return false

  const allowlist = new Set(
    (configuredEmails ?? '')
      .split(',')
      .map((candidate) => candidate.trim().toLowerCase())
      .filter(Boolean),
  )

  return allowlist.has(normalizedEmail)
}
