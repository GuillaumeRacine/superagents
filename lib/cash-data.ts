import "server-only";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { readCashSnapshot } from "@/lib/cash-snapshot.mjs";
export async function getCashData() {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) return null;
  return readCashSnapshot({
    json: process.env.CASH_SNAPSHOT_JSON,
    gzipBase64: process.env.CASH_SNAPSHOT_GZIP_BASE64,
  });
}
