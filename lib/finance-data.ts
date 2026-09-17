import "server-only";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { readFinanceSnapshot } from "@/lib/finance-snapshot.mjs";
export async function getFinanceData() {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) return null;
  return readFinanceSnapshot({
    json: process.env.FINANCE_SNAPSHOT_JSON,
    gzipBase64: process.env.FINANCE_SNAPSHOT_GZIP_BASE64,
  });
}
