import { redirect } from "next/navigation";
import { getFinanceData } from "@/lib/finance-data";
import { useMDXComponents } from "nextra-theme-docs";
import FinanceDashboard from "./workspace";
const { wrapper: Wrapper } = useMDXComponents();
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Finance Dashboard",
  robots: { index: false, follow: false },
};
const pageMetadata = {
  title: "Finance Dashboard",
  filePath: "app/finance/page.tsx",
  searchable: false,
};
export default async function FinancePage() {
  const data = await getFinanceData();
  if (!data) redirect("/api/auth/signin?callbackUrl=%2Ffinance");
  return (
    <Wrapper toc={[]} metadata={pageMetadata} sourceCode="">
      <FinanceDashboard initial={data.snapshot} sourceState={data.state} />
    </Wrapper>
  );
}
