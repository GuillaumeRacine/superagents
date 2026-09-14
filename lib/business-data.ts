import 'server-only'
import { auth } from '@/auth'
import { isAllowedEmail } from '@/lib/access-policy.mjs'
import { readSnapshot } from '@/lib/business-model.mjs'

// Check every entry point, before touching private configuration. Never cache.
export async function getBusinessData() {
  const session = await auth()
  if (!isAllowedEmail(session?.user?.email)) return null
  return readSnapshot(process.env.BUSINESS_SNAPSHOT_JSON)
}
