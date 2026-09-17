// Isolated Chrome QA using fictional records and synthetic LOCAL sessions only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import { emptyFinance, validateFinance } from "../lib/finance-model.mjs";
if (!process.env.FINANCE_PLAYWRIGHT_MODULE)
  throw Error(
    "Set FINANCE_PLAYWRIGHT_MODULE to the installed Playwright module.",
  );
const { chromium } = await import(process.env.FINANCE_PLAYWRIGHT_MODULE);
const output = process.env.FINANCE_QA_OUTPUT || "/tmp/finance-qa";
mkdirSync(output, { recursive: true });
const d = validateFinance({
  ...emptyFinance(),
  entities: [
    { id: "holding", name: "Example Holdings", kind: "holding" },
    { id: "personal", name: "Example Personal", kind: "personal" },
    {
      id: "venture",
      name: "Example Ventures",
      kind: "operating",
      parentId: "holding",
      ownership: 100,
    },
  ],
  assets: [
    {
      id: "rental",
      entityId: "personal",
      name: "Example Cabin",
      category: "property",
      currency: "CAD",
      status: "active",
      propertyType: "rental",
      included: "yes",
    },
    {
      id: "angel",
      entityId: "holding",
      name: "Example Startup",
      category: "angel",
      currency: "CAD",
      status: "active",
      included: "yes",
    },
  ],
  valuations: [
    { assetId: "rental", date: "2026-09-01", gross: 500000, debt: 200000 },
    { assetId: "angel", date: "2026-09-01", gross: 100000, debt: 0 },
  ],
  transactions: [
    {
      id: "rent",
      entityId: "personal",
      account: "checking",
      institution: "Example Bank",
      date: "2026-09-01",
      description: "Rental payout",
      amount: 3000,
      currency: "CAD",
      category: "income",
      assetId: "rental",
      reviewed: "no",
    },
    {
      id: "fee",
      entityId: "personal",
      account: "checking",
      institution: "Example Bank",
      date: "2026-09-02",
      description: "Management fee",
      amount: -300,
      currency: "CAD",
      category: "fee",
      assetId: "rental",
      reviewed: "no",
    },
  ],
  tasks: [
    {
      id: "maintenance",
      entityId: "personal",
      assetId: "rental",
      title: "Review maintenance quote",
      due: "2026-09-28",
      status: "open",
    },
  ],
  updates: [
    {
      id: "update",
      assetId: "angel",
      date: "2026-09-10",
      title: "September company update",
      metric: "Revenue",
      value: 20000,
      unit: "CAD / month",
      note: "Fictional QA only",
      url: "https://example.com/update",
    },
  ],
  documents: [
    {
      id: "statement",
      entityId: "venture",
      name: "Example financial statement",
      category: "Statements",
      url: "https://example.com/statement",
    },
  ],
});
d.tasks.push({
  id: "corporate",
  entityId: "holding",
  assetId: "",
  title: "Review corporate records",
  due: "",
  status: "open",
  source: "",
});
d.assets.push({
  ...d.assets[1],
  id: "excluded",
  name: "Example Excluded",
  included: "no",
});
d.valuations.push({
  assetId: "excluded",
  date: "2026-09-01",
  gross: 900000,
  debt: 0,
  source: "",
});
d.statements.push({
  id: "stmt",
  entityId: "personal",
  institution: "Example Bank",
  account: "checking",
  period: "2026-09",
  currency: "CAD",
  opening: 1000,
  closing: 3950,
  source: "",
});
d.transactions.push(
  {
    id: "transfer-out",
    entityId: "holding",
    account: "checking",
    institution: "Example Bank",
    date: "2026-09-03",
    description: "Inter-entity transfer out",
    amount: -250,
    currency: "CAD",
    category: "transfer",
    assetId: "",
    reviewed: "no",
    transferPairId: "pair",
  },
  {
    id: "transfer-in",
    entityId: "personal",
    account: "checking",
    institution: "Example Bank",
    date: "2026-09-03",
    description: "Inter-entity transfer in",
    amount: 250,
    currency: "CAD",
    category: "transfer",
    assetId: "",
    reviewed: "no",
    transferPairId: "pair",
  },
);
d.valuations[0].source = "https://example.com/valuation";
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${port}`,
  secret = "local-finance-ui-proof-only";
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    env: {
      ...process.env,
      AUTH_SECRET: secret,
      AUTH_TRUST_HOST: "true",
      AUTH_GOOGLE_ID: "example",
      AUTH_GOOGLE_SECRET: "example",
      AUTHORIZED_GOOGLE_EMAILS: "owner@example.com",
      FINANCE_SNAPSHOT_JSON: "",
    },
    stdio: "ignore",
  },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + "/robots.txt");
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    acceptDownloads: true,
  });
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: await encode({
        secret,
        salt: "authjs.session-token",
        token: { email: "owner@example.com" },
        maxAge: 1800,
      }),
      url: base,
    },
  ]);
  const page = await context.newPage(),
    errors = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST" && !r.url().includes("/api/auth/"))
      writes.push(r.url());
  });
  await page.goto(base + "/finance");
  await page
    .getByRole("heading", { name: "Your capital. A clearer picture." })
    .waitFor();
  await page.getByLabel("As of month").fill("2026-09");
  await page.screenshot({
    path: output + "/empty-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Import data$/ })
    .click();
  await page
    .getByLabel("Import table", { exact: true })
    .selectOption("workspace");
  await page.getByLabel("Or paste workspace JSON").fill(JSON.stringify(d));
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await page.getByRole("button", { name: "Replace workspace" }).click();
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Overview$/ })
    .click();
  assert((await page.locator("body").innerText()).includes("CAD 400,000"));
  assert(
    (
      await page
        .getByRole("img", { name: /Monthly net asset values/ })
        .getAttribute("aria-label")
    ).includes("CAD 400,000"),
  );
  await page.screenshot({
    path: output + "/overview-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Transactions$/ })
    .click();
  assert(await page.getByText("Balanced", { exact: true }).isVisible());
  await page.getByLabel("Entity", { exact: true }).selectOption("personal");
  assert.equal(
    await page.getByText(/transfer group\(s\) need matching/).count(),
    0,
  );
  await page.getByLabel("Entity", { exact: true }).selectOption("all");
  await page.getByLabel("Reviewed: Rental payout").check();
  assert(await page.getByLabel("Reviewed: Rental payout").isChecked());
  await page.getByLabel("Review status").selectOption("no");
  assert(
    !(await page.locator("table").first().innerText()).includes(
      "Rental payout",
    ),
  );
  const txDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export filtered CSV" }).click();
  await (await txDownload).saveAs(output + "/filtered.csv");
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Investments$/ })
    .click();
  assert(
    (
      await page
        .locator("article")
        .filter({ hasText: "KNOWN ASSIGNED VALUE" })
        .last()
        .innerText()
    ).includes("CAD 100,000"),
  );
  await page.getByRole("button", { name: /Example Startup/ }).click();
  assert(await page.getByText("September company update").isVisible());
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Properties$/ })
    .click();
  assert((await page.locator("body").innerText()).includes("CAD 2,700"));
  await page.getByLabel("Complete: Review maintenance quote").check();
  assert(
    await page.getByLabel("Complete: Review corporate records").isVisible(),
  );
  await page.screenshot({
    path: output + "/properties-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Documents$/ })
    .click();
  assert(
    await page
      .getByText("Example financial statement", { exact: true })
      .isVisible(),
  );
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Ventures$/ })
    .click();
  await page.getByRole("button", { name: "Company documents" }).click();
  assert.equal(
    await page.getByLabel("Entity", { exact: true }).inputValue(),
    "venture",
  );
  assert(
    await page
      .getByText("Example financial statement", { exact: true })
      .isVisible(),
  );
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Import data$/ })
    .click();
  await page
    .getByLabel("Import table", { exact: true })
    .selectOption("valuations");
  const textarea = page.getByLabel("Or paste CSV content");
  await textarea.fill("assetId,date,gross,debt\nrental,2026-09-31,10,0");
  await page.getByRole("button", { name: "Validate & preview" }).click();
  assert(await page.locator("p[role=alert]").isVisible());
  assert.equal(
    await page.getByRole("button", { name: "Apply import" }).count(),
    0,
  );
  await textarea.fill(
    "assetId,date,gross,debt\nrental,2026-09-01,510000,195000",
  );
  await page.getByRole("button", { name: "Validate & preview" }).click();
  assert(
    await page
      .getByText("1 validated rows · 0 new · 1 existing rows replaced.")
      .isVisible(),
  );
  assert((await page.locator("body").innerText()).includes("510000"));
  assert(
    await page.getByText(/This import will clear 1 existing field/).isVisible(),
  );
  await page.getByRole("button", { name: "Apply import" }).click();
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Overview$/ })
    .click();
  assert((await page.locator("body").innerText()).includes("CAD 415,000"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace" }).click();
  await (await download).saveAs(output + "/workspace.json");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [i, name] of [
      "Overview",
      "Transactions",
      "Investments",
      "Properties",
      "Documents",
      "Ventures",
      "Import data",
    ].entries()) {
      await page
        .getByRole("navigation", { name: "Finance sections" })
        .getByRole("button", { name: new RegExp(name + "$") })
        .click();
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      ) {
        await page.screenshot({
          path: output + "/overflow.png",
          fullPage: true,
        });
        console.log(
          await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            offenders: [...document.querySelectorAll("body *")]
              .map((e) => ({
                tag: e.tagName,
                cls: e.className,
                right: e.getBoundingClientRect().right,
                width: e.getBoundingClientRect().width,
                scroll: e.scrollWidth,
              }))
              .filter((e) => e.right > innerWidth + 1)
              .slice(-20),
          })),
        );
        throw Error(`${name} overflow at ${viewport.width}`);
      }
    }
    await page
      .getByRole("navigation", { name: "Finance sections" })
      .getByRole("button", { name: /Overview$/ })
      .click();
    await page.screenshot({
      path: output + `/overview-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: output + "/overview-dark.png",
    fullPage: true,
  });
  const exported = JSON.parse(readFileSync(output + "/workspace.json", "utf8"));
  assert.equal(
    exported.transactions.find((t) => t.id === "rent").reviewed,
    "yes",
  );
  assert.equal(
    exported.tasks.find((t) => t.id === "maintenance").status,
    "done",
  );
  validateFinance(exported);
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Import data$/ })
    .click();
  await page
    .getByLabel("Import table", { exact: true })
    .selectOption("workspace");
  await page.getByLabel("Or paste workspace JSON").fill(
    JSON.stringify({
      ...d,
      transactions: Array.from({ length: 51 }, (_, i) => ({
        ...d.transactions[0],
        id: "page-" + i,
        description: "Pagination record " + i,
        amount: 0,
        reviewed: "no",
      })),
    }),
  );
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await page.getByRole("button", { name: "Replace workspace" }).click();
  await page
    .getByRole("navigation", { name: "Finance sections" })
    .getByRole("button", { name: /Transactions$/ })
    .click();
  await page.getByLabel("Review status").selectOption("no");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByLabel("Reviewed: Pagination record 50", { exact: true })
    .click();
  assert(await page.getByText("50 matching records · Page 1 of 1").isVisible());
  assert.equal(
    await page.locator("table").first().locator("tbody tr").count(),
    50,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(
    "PASS Chrome UI: all seven sections, import/restore/replace/error atomicity, totals, review, drilldown, P&L, tasks, document scoping, CSV/JSON downloads, mobile/tablet overflow, no errors or data uploads",
  );
} finally {
  await browser?.close();
  server.kill();
}
