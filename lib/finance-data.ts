import "server-only";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { readFinance } from "@/lib/finance-model.mjs";
export async function getFinanceData() {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) return null;
  return readFinance(process.env.FINANCE_SNAPSHOT_JSON);
}
