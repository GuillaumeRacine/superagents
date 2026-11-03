// Gate proof for /dashboard/cash, /api/cash and the /dashboard hub against a LOCAL built
// server with a throwaway AUTH_SECRET and fictional records. Never run
// against production; never create a production session.
// Two owner renders (issue #61): with MONEYOS_METRICS_FILE pointing at a fictional
// moneyos_metrics_v1 file (live bands, sha and generated_at line) and without it
// (fallback notice plus the published env snapshot's bands).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "next-auth/jwt";
import { SCHEMA, validateCash } from "../lib/cash-model.mjs";
import { validateMetrics } from "../lib/metrics-model.mjs";
import { metricsFixture, METRICS_MARKER } from "./fixtures/metrics-fixture.mjs";
const secret = "synthetic-cash-verification-only",
  marker = "SYNTHETIC_PRIVATE_CASH_SENTINEL";
const fixture = validateCash({
  schemaVersion: SCHEMA,
  generatedAt: "2026-10-19T12:00:00.000Z",
  feed: { lastPostDate: "2026-10-19", monthlyClosed: "2026-09", owner: "Example", channel: "#example" },
  fx: { usdcad: 1.38, asOf: "2026-09-30", source: "example" },
  entities: [
    {
      id: "holdco",
      label: marker,
      balances: [
        { account: "Bank CAD 1111", currency: "CAD", amount: 100000, asOf: "2026-09-30", source: "stmt" },
        { account: "Bank USD 2222", currency: "USD", amount: 500, asOf: "2026-09-30", source: "stmt" },
      ],
    },
    { id: "opco", label: "Example Opco", balances: [{ account: "Bank CAD 3333", currency: "CAD", amount: null, asOf: null, source: "" }] },
  ],
  taxItems: [{ key: "n1", entity: "holdco", kind: "notice", amountCad: 7000, text: "Example notice", open: true, source: "mail", asOf: "2026-10-19" }],
  fundingTargets: [{ id: "rrsp", label: "Example RRSP", targetCad: 10000, deadline: "2027-03-01", contributedCad: null, status: "open" }],
  fundingPlan: { totalCad: 10000, asOf: "2026-10-19", source: "example plan" },
  stoicCover: { entityId: "holdco", claimsAsOf: "2026-10-19", claimKeys: ["n1"] },
  debts: [{ id: "m1", name: "Example mortgage 0001", scope: "personal", lender: "Bank", kind: "mortgage", balanceCad: 100000, balanceAsOf: "2026-09", ratePct: 4, interestMonthCad: 333.33 }],
  burn: { asOf: "2026-10-18", t30dNetBurnCad: 1234, topCategories: [["Travel", 500]], accountsLastDate: { "Example chequing": "2026-10-18" } },
  scorecard: {
    asOf: "2026-10-19",
    lastFullMonth: { month: "2026-09", cad: -2000, source: "example" },
    savingsRate: { month: "2026-09", monthRatePct: -12.5, monthStatus: "provisional", t12Label: "T12 2025-10 to 2026-09", t12RatePct: 4, definition: "(income − opex) / income, example definition", asOf: "2026-09-30", source: "example csv" },
  },
  tasks: [{ id: "t1", who: "gui", kind: "cut", title: "Example first open task", deadline: "2026-10-20", burnCadMo: 10 }],
  // MoneyOS record sections (issue #54), fictional.
  books: { suspenseCad: -1234.5, trialBalanceCad: 0, balanced: true, tieOutsPassing: 40, tieOutsFailing: 2, tieOutsOther: 3, asOf: "2026-10-31" },
  payables: [
    { id: "P01", priority: 1, type: "payable", entity: "personal", counterparty: `${marker}_PAYEE`, description: "Example bill", amount: 321, currency: "CAD", dueDate: "2026-10-17", status: "open", lastChecked: "2026-10-19" },
    { id: "P02", priority: 2, type: "payable", entity: "holdco", counterparty: "Example Card", amount: null, dueDate: null, dueNote: "next statement", status: "MISSING", lastChecked: "2026-10-19" },
  ],
  clarify: { openToClarifyRows: 12, openQuestions: 3, batches: 2, asOf: "2026-10-18" },
  contract: { version: "2.0.0", hash: "0123456789ab", date: "2026-10-12", requiredAcks: ["Agent A", "Agent B"], ackedAgents: ["Agent A"], graceUntil: "2026-10-19" },
  cabin: { lastStatementMonth: "2026-09", nights: 11, grossCad: 2500, salesTaxesCad: 200, depositCad: 1200, netExTaxCad: 950, statementsOnFile: 9 },
});
// The live metrics fixture is validated here so the gate fails on a drifted fixture before the server starts.
validateMetrics(metricsFixture());
for (const route of ["dashboard", "dashboard/cash", "dashboard/invest", "finance", "cash", "invest"])
  assert(!existsSync(`.next/server/app/${route}.html`), `${route} must not be prerendered`);
function scan(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, e.name);
    if (e.isDirectory()) scan(file);
    else {
      const bytes = readFileSync(file);
      assert(!bytes.includes(Buffer.from(marker)), `Private marker in ${file}`);
      assert(!bytes.includes(Buffer.from(METRICS_MARKER)), `Private metrics marker in ${file}`);
    }
  }
}
scan("public");
scan(".next/static");
const session = (email, maxAge = 600) => encode({ secret, salt: "authjs.session-token", token: { email }, maxAge });

// Start the built server with the given extra env, run fn(base, get), stop it.
async function withServer(extraEnv, fn) {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: {
      ...process.env,
      AUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "example",
      AUTH_GOOGLE_SECRET: "example",
      AUTH_TRUST_HOST: "true",
      AUTHORIZED_GOOGLE_EMAILS: "owner@example.com",
      CASH_SNAPSHOT_JSON: JSON.stringify(fixture),
      FINANCE_SNAPSHOT_JSON: "",
      // The live transport is never pointed at a repository from this gate.
      MONEYOS_REPO: "",
      MONEYOS_READ_TOKEN: "",
      MONEYOS_METRICS_FILE: "",
      ...extraEnv,
    },
    stdio: "ignore",
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(base + "/robots.txt");
        ready = true;
        break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(ready, "Local server must start");
    const get = (path, token, spoof = false) =>
      fetch(base + path, {
        redirect: "manual",
        headers: {
          cookie: `authjs.session-token=${token}`,
          ...(path.includes("_rsc") ? { RSC: "1" } : {}),
          ...(spoof ? { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" } : {}),
        },
      });
    await fn(base, get);
  } finally {
    server.kill();
  }
}

// ---- Run 1: no live metrics configured -> gate, fallback notice, the env snapshot's bands ----
await withServer({}, async (base, get) => {
  const paths = ["/dashboard/cash", "/api/cash", "/dashboard/cash?_rsc", "/dashboard", "/dashboard/invest"];
  // Anonymous: 307 to sign-in with the callback preserved, nothing private in the body.
  for (const path of paths) {
    const r = await get(path, "");
    assert([307, 401].includes(r.status), `${path} anonymous must be blocked, got ${r.status}`);
    if (r.status === 307) {
      const location = new URL(r.headers.get("location"), base);
      assert.equal(location.pathname, "/api/auth/signin");
      assert.equal(location.searchParams.get("callbackUrl"), path.split("?")[0]);
    }
    assert(!(await r.text()).includes(marker));
  }
  console.log("PASS cash anonymous: 307 to sign-in on /dashboard/cash, /dashboard, /dashboard/invest; API 401");
  // Disallowed, expired and invalid sessions are blocked on ordinary and spoofed requests.
  for (const [label, token] of [
    ["disallowed", await session("other@example.com")],
    ["expired", await session("owner@example.com", -100)],
    ["invalid", "invalid"],
  ])
    for (const spoof of [false, true])
      for (const path of paths) {
        const r = await get(path, token, spoof);
        assert([307, 401].includes(r.status), `${path} ${label} must be blocked`);
        assert(!(await r.text()).includes(marker));
      }
  console.log("PASS cash disallowed/expired/invalid sessions blocked, spoofed headers included");
  // Owner renders every section with the fictional records and no-store headers.
  const owner = await session("owner@example.com");
  const page = await get("/dashboard/cash", owner);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(page.headers.get("cache-control"), /no-store/);
  for (const expected of [
    marker,
    "Cash &amp; Core Metrics",
    "Owner: Chief of Cash (GrokBot)",
    // Fallback notice in the as-of bar (issue #61): the reason and the snapshot's build time.
    "Live metrics unavailable: live metrics not configured (MONEYOS_REPO and MONEYOS_READ_TOKEN); showing the published snapshot from 2026-10-19T12:00:00.000Z.",
    "01 / ENTITIES AND BALANCES",
    "02 / ALERTS AND NEXT 7 DAYS",
    "03 / FUNDING PROGRESS 2026",
    "04 / STOIC COVER",
    "05 / DEBT AND INTEREST",
    "06 / TRAILING 30-DAY BURN AND TASKS",
    "Example first open task",
    "CAD 83,000", // 100,000 − 7,000 − 10,000: cover from one entity only
    "unknown", // Opco's null balance renders as unknown, never 0
    // MoneyOS record (issue #54): owner line, North Star and the new bands.
    "record of truth: main of the private MoneyOS repository",
    "Savings rate",
    "-12.50%", // non-integer figures keep two decimals (same rule as Money)
    "T12 2025-10 to 2026-09",
    "4%",
    "below target",
    "Books",
    "CAD -1,234.50",
    "40 / 42 tieable",
    "40 tie / 2 do not / 3 not tied",
    "balanced",
    "Payables and receivables",
    `${marker}_PAYEE`,
    "CAD 321",
    "overdue",
    "next statement",
    "MISSING",
    "Open items",
    "Contract",
    "0123456789ab",
    "Agent B: missing",
    "Cabin",
    "11 nights",
    "CAD 950",
  ])
    assert(html.includes(expected), `/dashboard/cash must render ${expected}`);
  assert(!html.includes("CAD 100,500"), "Entities must never be summed");
  assert(!html.includes("CAD 0<"), "Unknown must never render as zero");
  assert(!html.includes("Context/cfo-feed"), "Owner line must not name the retired record");
  assert(!html.includes("moneyos@"), "Fallback render must not claim a live commit");
  assert(!html.includes("Monthly P&amp;L"), "Fallback render must not mix in live bands");
  // Grace ends 2026-10-19 and the page renders later, so the missing ack is red and in the week's list.
  assert(html.includes("Acknowledgement missing after grace"), "Missing ack after grace must render as an alert");
  assert(html.includes("Contract acknowledgement missing after grace: Agent B"), "Missing ack must reach Needs you soon");
  const api = await get("/api/cash", owner);
  assert.equal(api.status, 200);
  assert.deepEqual((await api.json()).snapshot, fixture);
  const rsc = await get("/dashboard/cash?_rsc", owner);
  assert.equal(rsc.status, 200);
  assert((await rsc.text()).includes(marker));
  const hub = await get("/dashboard", owner);
  assert.equal(hub.status, 200);
  const hubHtml = await hub.text();
  for (const href of ["/dashboard/cash", "/dashboard/invest", "/dashboard/business", "/"])
    assert(hubHtml.includes(`href="${href}"`), `Hub must link ${href}`);
  assert(hubHtml.includes("moved to /dashboard/invest"));
  assert(hubHtml.includes("Cash &amp; Core Metrics"), "Hub card must carry the new title");
  assert(hubHtml.includes("the private MoneyOS repository") && !/github\.com\/[A-Za-z0-9-]+\/moneyos/i.test(hubHtml), "Hub names the record, never a slug");
  assert(hubHtml.includes('href="/dashboard"') && !hubHtml.includes('href="/finance"'), "Nav must point at /dashboard, not /finance");
  const invest = await get("/dashboard/invest", owner);
  assert.equal(invest.status, 200);
  const investHtml = await invest.text();
  assert(investHtml.includes("Owner: to assign") && investHtml.includes("SUPER AGENTS / FINANCE / INVEST"));
  assert(!investHtml.includes(marker), "Invest must not read the cash snapshot");
  const post = await fetch(base + "/api/cash", { method: "POST", headers: { cookie: `authjs.session-token=${owner}` } });
  assert.equal(post.status, 405, "No write endpoint");
  // The old routes redirect permanently to the /dashboard section (issue #49).
  for (const [from, to] of [
    ["/cash", "/dashboard/cash"],
    ["/finance", "/dashboard"],
    ["/invest", "/dashboard/invest"],
    ["/finance/cash", "/dashboard/cash"],
    ["/finance/invest", "/dashboard/invest"],
  ]) {
    const r = await get(from, "");
    assert.equal(r.status, 308, `${from} must redirect permanently`);
    assert.equal(r.headers.get("location"), to, `${from} must redirect to ${to}`);
  }
  console.log("PASS cash fallback: /dashboard/cash renders the fallback notice plus the six sections and the MoneyOS bands (savings rate, books, payables, open items, contract, cabin), cover from one entity, unknown never zero; /api/cash JSON; /dashboard hub; /dashboard/invest; old routes 308; no write endpoint");
});

// ---- Run 2: MONEYOS_METRICS_FILE -> the live core-metrics dashboard, every band ----
const dir = mkdtempSync(join(tmpdir(), "metrics-fixture-"));
const file = join(dir, "metrics.json");
writeFileSync(file, JSON.stringify(metricsFixture()));
try {
  await withServer({ MONEYOS_METRICS_FILE: file }, async (base, get) => {
    const anon = await get("/dashboard/cash", "");
    assert.equal(anon.status, 307);
    assert(!(await anon.text()).includes(METRICS_MARKER));
    const other = await get("/dashboard/cash", await session("other@example.com"));
    assert.equal(other.status, 307);
    assert(!(await other.text()).includes(METRICS_MARKER));
    const owner = await session("owner@example.com");
    const page = await get("/dashboard/cash", owner);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("cache-control"), /no-store/);
    const html = await page.text();
    for (const expected of [
      METRICS_MARKER,
      "Cash &amp; Core Metrics",
      "Owner: Chief of Cash (GrokBot)",
      // Status bar: provenance id, generated_at, ledger through, commit, items for the week, stale accounts.
      "metrics 0a1b2c3d4e5f · generated 2026-10-19T11:30:00Z · ledger through 2026-10-18",
      "moneyos@abc1234", // the file's own claim: the file transport reads no commit
      "built from head fedcba9",
      "file commit not read (file transport)",
      "the record's own verdicts were as of 2026-10-19T11:30:00Z",
      "days old (generated 2026-10-19T11:30:00Z)", // the 14-day red notice (fixture is older)
      "unknown (balance missing for …1111, …4444)",
      "Example overdraft 0003",
      "3 facilities",
      "personal · interest this month",
      "opco · interest this month",
      "1 of 2 facilities known",
      "the record&#x27;s own figure, not re-added here",
      "verification only) · read at render · rendered", // the file transport reads at render; the repository path says "age at most 5 min", never a read timestamp
      "As of 2026-10-18 (ledger) · generated 2026-10-19T11:30:00Z · moneyos@abc1234",
      "Live source: a local metrics file (MONEYOS_METRICS_FILE, verification only)",
      // Bands in order.
      "Savings rate",
      "-12.50%",
      "below target",
      "T12 2025-10 to 2026-09",
      "-32.50 pts vs target",
      "CAD 6,000", // earned income ex crypto
      "25%", // crypto share
      "30-day net burn",
      "5,678",
      "personal + example opco, CAD at BoC",
      "Needs you soon",
      `${METRICS_MARKER}_PAYEE: CAD 321`,
      "3 open questions waiting for your answer",
      "Monthly P&amp;L",
      "2026-07", // a month whose income is unknown renders, not zero
      "Income by source",
      `${METRICS_MARKER} salary`,
      "CAD 90,000",
      "Spend by line",
      "Living: Food: groceries",
      "CAD +100", // 1,200 vs 1,100 average
      "Interest by month",
      "…0836: 1,000",
      "Debts",
      "CAD 450,000",
      "Example mortgage ...0836",
      "Liquidity and runway",
      "holdco · CAD",
      "CAD 100,000",
      "personal CAD cash / T12 average opex · unknown stays unknown", // runway method beside an unknown figure
      "Net worth",
      "preview until approved",
      "CAD 1,234,567",
      "Funding targets",
      "Example blocked",
      "Payables and receivables",
      "next statement",
      "Cabin",
      "11 nights",
      ">120<", // T12 nights
      "Books",
      "40 / 42 tieable",
      "CAD 2,500", // due from the operating entity
      "Open items",
      "Q24",
      "Contract",
      "0123456789ab",
      "Agent B: missing",
      "Account freshness",
      "Example dead feed …4444",
      "monarch",
      "Record files behind this page",
      "ledger.csv",
      "rebuilt from ledger",
      "Metrics schema moneyos_metrics_v1",
    ])
      assert(html.includes(expected), `/dashboard/cash (live) must render ${expected}`);
    // Unknown never zero: personal cash, 2026-07 income, runway, T12 owner costs are null in the fixture,
    // and every "CAD 0" is one of the fixture's real zeros: P&L owner flows (2026-09), P&L crypto (2026-08),
    // holdco debts, the overdraft's balance and its monthly interest, and opco's per-entity tile (interest, balance).
    assert.equal((html.match(/CAD 0</g) ?? []).length, 7, "Only real zeros render as zero");
    assert((html.match(/>unknown</g) ?? []).length >= 6, "Each null renders as unknown");
    // No cross-entity sum: holdco 100,000 + opco 1,000 never appears; the sheet total is the record's own figure.
    assert(!html.includes("CAD 101,000"), "Entities must never be summed");
    assert(/\d of 4 accounts stale/.test(html), "Status bar counts stale accounts");
    assert(!html.includes("CAD 1,350,000"), "Net worth is not re-added across entities");
    assert(!html.includes("Interest this month</span>"), "No cross-entity interest headline");
    // Masking re-applied on read: the fixture's 7-digit bill number shows as its last four.
    assert(html.includes("Example bill ...4567") && !html.includes("1234567<"), "Digit runs are masked on read");
    // Never both sources at once.
    assert(!html.includes("Live metrics unavailable"), "Live render must not carry the fallback notice");
    assert(!html.includes("01 / ENTITIES AND BALANCES") && !html.includes(marker), "Live render must not mix in the env snapshot");
    // The token and repository name never reach the client.
    assert(!/MONEYOS_READ_TOKEN|Bearer /.test(html), "No token material in the HTML");
    // Stale account rows carry the highlight class; fresh ones do not.
    assert((html.match(/staleRow/g) ?? []).length >= 2, "Stale account rows are highlighted");
    const rsc = await get("/dashboard/cash?_rsc", owner);
    assert.equal(rsc.status, 200);
    assert((await rsc.text()).includes(METRICS_MARKER));
    // /api/cash still serves the validated env snapshot, unchanged.
    const api = await get("/api/cash", owner);
    assert.equal(api.status, 200);
    assert.deepEqual((await api.json()).snapshot, fixture);
    console.log("PASS cash live: /dashboard/cash renders moneyos@sha7 and generated_at, the status bar and every band (savings rate, burn, needs you, P&L, income, spend, interest, debts, liquidity, net worth preview, funding, payables, cabin, books, open items, contract, freshness, sources); unknown never zero; no cross-entity sum; masking re-applied; sources never mixed");
  });
  // Run 3: a file that fails validation falls back with the reason in the notice, never partial data.
  writeFileSync(file, JSON.stringify({ ...metricsFixture(), burn: { as_of: "yesterday" } }));
  await withServer({ MONEYOS_METRICS_FILE: file }, async (base, get) => {
    const html = await (await get("/dashboard/cash", await session("owner@example.com"))).text();
    assert(html.includes("Live metrics unavailable: validation: burn.as_of must be an ISO date.; showing the published snapshot from 2026-10-19T12:00:00.000Z."), "Invalid live file must fall back with its reason");
    assert(!html.includes(METRICS_MARKER) && html.includes(marker), "Invalid live file must not leak partial live data");
    console.log("PASS cash invalid live file: fallback notice names the validation error; env snapshot shown; no partial live data");
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
