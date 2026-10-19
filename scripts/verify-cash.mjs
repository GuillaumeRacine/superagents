// Gate proof for /cash, /api/cash and the /finance hub against a LOCAL built
// server with a throwaway AUTH_SECRET and a fictional snapshot. Never run
// against production; never create a production session.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { encode } from "next-auth/jwt";
import { SCHEMA, validateCash } from "../lib/cash-model.mjs";
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
  tasks: [{ id: "t1", who: "gui", kind: "cut", title: "Example first open task", deadline: "2026-10-20", burnCadMo: 10 }],
});
for (const route of ["finance", "cash", "invest"])
  assert(!existsSync(`.next/server/app/${route}.html`), `${route} must not be prerendered`);
function scan(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, e.name);
    if (e.isDirectory()) scan(file);
    else assert(!readFileSync(file).includes(Buffer.from(marker)), `Private marker in ${file}`);
  }
}
scan("public");
scan(".next/static");
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    env: {
      ...process.env,
      AUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "example",
      AUTH_GOOGLE_SECRET: "example",
      AUTH_TRUST_HOST: "true",
      AUTHORIZED_GOOGLE_EMAILS: "owner@example.com",
      CASH_SNAPSHOT_JSON: JSON.stringify(fixture),
      FINANCE_SNAPSHOT_JSON: "",
    },
    stdio: "ignore",
  },
);
const session = (email, maxAge = 600) =>
  encode({ secret, salt: "authjs.session-token", token: { email }, maxAge });
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
  const paths = ["/cash", "/api/cash", "/cash?_rsc", "/finance", "/invest"];
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
  console.log("PASS cash anonymous: 307 to sign-in on /cash, /finance, /invest; API 401");
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
  const page = await get("/cash", owner);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(page.headers.get("cache-control"), /no-store/);
  for (const expected of [
    marker,
    "Owner: Chief of Cash (GrokBot)",
    "01 / ENTITIES AND BALANCES",
    "02 / ALERTS AND NEXT 7 DAYS",
    "03 / FUNDING PROGRESS 2026",
    "04 / STOIC COVER",
    "05 / DEBT AND INTEREST",
    "06 / TRAILING 30-DAY BURN AND TASKS",
    "Example first open task",
    "CAD 83,000", // 100,000 − 7,000 − 10,000: cover from one entity only
    "unknown", // Opco's null balance renders as unknown, never 0
  ])
    assert(html.includes(expected), `/cash must render ${expected}`);
  assert(!html.includes("CAD 100,500"), "Entities must never be summed");
  assert(!html.includes("CAD 0<"), "Unknown must never render as zero");
  const api = await get("/api/cash", owner);
  assert.equal(api.status, 200);
  assert.deepEqual((await api.json()).snapshot, fixture);
  const rsc = await get("/cash?_rsc", owner);
  assert.equal(rsc.status, 200);
  assert((await rsc.text()).includes(marker));
  const hub = await get("/finance", owner);
  assert.equal(hub.status, 200);
  const hubHtml = await hub.text();
  assert(hubHtml.includes('href="/cash"') && hubHtml.includes('href="/invest"'), "Hub must link both dashboards");
  assert(hubHtml.includes("moved to /invest"));
  const invest = await get("/invest", owner);
  assert.equal(invest.status, 200);
  const investHtml = await invest.text();
  assert(investHtml.includes("Owner: to assign") && investHtml.includes("SUPER AGENTS / FINANCE / INVEST"));
  assert(!investHtml.includes(marker), "Invest must not read the cash snapshot");
  const post = await fetch(base + "/api/cash", { method: "POST", headers: { cookie: `authjs.session-token=${owner}` } });
  assert.equal(post.status, 405, "No write endpoint");
  console.log("PASS cash owner: /cash renders six sections, cover from one entity, unknown never zero; /api/cash JSON; /finance hub; /invest; no write endpoint");
} finally {
  server.kill();
}
