import { redirect } from "next/navigation";
import { getCashData } from "@/lib/cash-data";
import { useMDXComponents } from "nextra-theme-docs";
import CashDashboard from "./cash-view";
const { wrapper: Wrapper } = useMDXComponents();
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Cash",
  robots: { index: false, follow: false },
};
const pageMetadata = {
  title: "Cash",
  filePath: "app/finance/cash/page.tsx",
  searchable: false,
};
export default async function CashPage() {
  const data = await getCashData();
  if (!data) redirect("/api/auth/signin?callbackUrl=%2Ffinance%2Fcash");
  return (
    <Wrapper toc={[]} metadata={pageMetadata} sourceCode="">
      <CashDashboard snapshot={data.snapshot} state={data.state} renderedAt={Date.now()} />
    </Wrapper>
  );
}
