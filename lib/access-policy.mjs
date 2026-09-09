/**
 * The allowlist is intentionally a single server-side email, not a domain.
 * Google email addresses are case-insensitive, so comparison is normalized.
 */
export function isAllowedEmail(email, configuredEmail = process.env.AUTHORIZED_GOOGLE_EMAIL) {
  const allowedEmail = configuredEmail?.trim().toLowerCase()
  return Boolean(allowedEmail && email?.trim().toLowerCase() === allowedEmail)
}
