import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { useMDXComponents } from "nextra-theme-docs";
import s from "./cash/cash.module.css";
const { wrapper: Wrapper } = useMDXComponents();
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};
const pageMetadata = {
  title: "Dashboard",
  filePath: "app/dashboard/page.tsx",
  searchable: false,
};
// Hub only. The three private surfaces live under /dashboard (issue #49);
// the former single Finance dashboard moved to /dashboard/invest (issue #44).
export default async function DashboardHub() {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email))
    redirect("/api/auth/signin?callbackUrl=%2Fdashboard");
  return (
    <Wrapper toc={[]} metadata={pageMetadata} sourceCode="">
      <div className={s.dashboard} data-pagefind-ignore="all">
        <header className={s.hero}>
          <div className={s.eyebrow}>SUPER AGENTS / DASHBOARD</div>
          <h1>Dashboard</h1>
          <p>Three private dashboards: cash and core metrics today, capital over time, the businesses and their evidence.</p>
          <div className={s.owner}>
            The old single Finance dashboard moved to /dashboard/invest on 2026-10-19 (issue #44); all dashboards moved under /dashboard (issue #49).
          </div>
        </header>
        <div className={s.cards}>
          <a className={s.card} href="/dashboard/cash">
            <div className={s.sectionLabel}>CASH &amp; CORE METRICS</div>
            <h2>Cash &amp; Core Metrics</h2>
            <p>Savings rate against the 20% North Star, 30-day burn, monthly P&amp;L, income by source, spend by line, interest, debts, liquidity and runway per entity, net worth preview, funding, payables, cabin, books, open items, contract and per-account freshness.</p>
            <p><small>Owner: Chief of Cash (GrokBot) · live from data/metrics.json on main of the private MoneyOS repository, re-read every five minutes; the published snapshot stands in when the live read fails, and the page says so</small></p>
            <span className={s.go}>Open Cash &amp; Core Metrics →</span>
          </a>
          <a className={s.card} href="/dashboard/invest">
            <div className={s.sectionLabel}>INVEST</div>
            <h2>Invest</h2>
            <p>Asset register, allocation, mark history, ownership map, angel portfolio, property equity and documents: the former Finance workspace.</p>
            <p><small>Owner: to assign (interim: Claude monthly /cfo invest run, Context#151) · monthly, month-end</small></p>
            <span className={s.go}>Open Invest →</span>
          </a>
          <a className={s.card} href="/dashboard/business">
            <div className={s.sectionLabel}>BUSINESS</div>
            <h2>Business</h2>
            <p>Your businesses, their results and metrics, outcomes, execution evidence and data coverage: read-only, from reviewed snapshots.</p>
            <p><small>Private · Read-only · Selected portfolio, not the whole estate · reviewed snapshots</small></p>
            <span className={s.go}>Open Business →</span>
          </a>
        </div>
        <p className={s.footer}>
          All routes are private, dynamic and no-store behind the same sign-in allowlist.
          <a href="/"> Documentation</a>
        </p>
      </div>
    </Wrapper>
  );
}
