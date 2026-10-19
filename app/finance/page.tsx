import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { useMDXComponents } from "nextra-theme-docs";
import s from "../cash/cash.module.css";
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
// Hub only. The former single dashboard moved to /invest (issue #44).
export default async function FinanceHub() {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email))
    redirect("/api/auth/signin?callbackUrl=%2Ffinance");
  return (
    <Wrapper toc={[]} metadata={pageMetadata} sourceCode="">
      <div className={s.dashboard} data-pagefind-ignore="all">
        <header className={s.hero}>
          <div className={s.eyebrow}>SUPER AGENTS / FINANCE</div>
          <h1>Finance</h1>
          <p>Two agent-owned dashboards: cash today, capital over time.</p>
          <div className={s.owner}>
            The old single Finance dashboard moved to /invest on 2026-10-19 (issue #44).
          </div>
        </header>
        <div className={s.cards}>
          <a className={s.card} href="/cash">
            <div className={s.sectionLabel}>CASH</div>
            <h2>Cash</h2>
            <p>Balances per entity, alerts and the next seven days, 2026 funding progress, Stoic cover, debt and interest, trailing-30-day burn and the task list.</p>
            <p><small>Owner: Chief of Cash (GrokBot) · weekdays after the 08:00 #cash feed · record of truth Context/cfo-feed</small></p>
            <span className={s.go}>Open Cash →</span>
          </a>
          <a className={s.card} href="/invest">
            <div className={s.sectionLabel}>INVEST</div>
            <h2>Invest</h2>
            <p>Asset register, allocation, mark history, ownership map, angel portfolio, property equity and documents: the former Finance workspace.</p>
            <p><small>Owner: to assign (interim: Claude monthly /cfo invest run, Context#151) · monthly, month-end</small></p>
            <span className={s.go}>Open Invest →</span>
          </a>
        </div>
        <p className={s.footer}>
          Both routes are private, dynamic and no-store behind the same sign-in allowlist.
          <a href="/business"> Business Dashboard</a> · <a href="/">Documentation</a>
        </p>
      </div>
    </Wrapper>
  );
}
