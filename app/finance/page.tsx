import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { useMDXComponents } from "nextra-theme-docs";
import s from "./cash/cash.module.css";
const { wrapper: Wrapper } = useMDXComponents();
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Finance",
  robots: { index: false, follow: false },
};
const pageMetadata = {
  title: "Finance",
  filePath: "app/finance/page.tsx",
  searchable: false,
};
// Landing only: no financial data is read here. Access is rechecked anyway.
export default async function FinanceLanding() {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email))
    redirect("/api/auth/signin?callbackUrl=%2Ffinance");
  return (
    <Wrapper toc={[]} metadata={pageMetadata} sourceCode="">
      <main className={s.page}>
        <h1>Finance</h1>
        <div className={s.cards}>
          <Link className={s.card} href="/finance/cash">
            <h2>Cash</h2>
            <p>Trailing-30-day net burn, savings banked, today&apos;s one action.</p>
          </Link>
          <Link className={s.card} href="/finance/invest">
            <h2>Invest</h2>
            <p>Portfolio, properties, ventures, transactions and documents.</p>
          </Link>
        </div>
      </main>
    </Wrapper>
  );
}
