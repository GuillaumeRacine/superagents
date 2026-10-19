import { redirect } from "next/navigation";
import { getFinanceData } from "@/lib/finance-data";
import { useMDXComponents } from "nextra-theme-docs";
import FinanceDashboard from "../finance/workspace";
const { wrapper: Wrapper } = useMDXComponents();
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Invest",
  robots: { index: false, follow: false },
};
const pageMetadata = {
  title: "Invest",
  filePath: "app/invest/page.tsx",
  searchable: false,
};
// The former single Finance dashboard, mounted unchanged under /invest.
// Data source stays the FINANCE_SNAPSHOT_* managed snapshot (docs/finance/README.md).
export default async function InvestPage() {
  const data = await getFinanceData();
  if (!data) redirect("/api/auth/signin?callbackUrl=%2Finvest");
  return (
    <Wrapper toc={[]} metadata={pageMetadata} sourceCode="">
      <FinanceDashboard
        initial={data.snapshot}
        sourceState={data.state}
        eyebrow="SUPER AGENTS / FINANCE / INVEST"
        ownerLine="Owner: to assign (interim: Claude monthly /cfo invest run, Context#151)"
      />
    </Wrapper>
  );
}
