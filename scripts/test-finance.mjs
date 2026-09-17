import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyFinance,
  validateFinance,
  readFinance,
  parseCsv,
  importCsv,
  csvExport,
  assetRows,
  totals,
  propertyPnl,
  transferWarnings,
  monthsThrough,
} from "../lib/finance-model.mjs";
export function fixture() {
  return validateFinance({
    ...emptyFinance(),
    entities: [
      { id: "holding", name: "Example Holdings", kind: "holding" },
      { id: "personal", name: "Example Person", kind: "personal" },
    ],
    assets: [
      {
        id: "rental",
        entityId: "personal",
        name: "Example Rental",
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
        currency: "USD",
        status: "dead",
        included: "yes",
      },
    ],
    valuations: [
      { assetId: "rental", date: "2026-08-31", gross: 500000, debt: 200000 },
      { assetId: "rental", date: "2026-09-30", gross: 510000, debt: 195000 },
      { assetId: "angel", date: "2026-09-30", gross: 0, debt: 0 },
    ],
  });
}
const tx = (id, category, amount, extra = {}) => ({
  id,
  category,
  amount,
  entityId: "personal",
  account: "checking",
  institution: "Example Bank",
  date: "2026-09-15",
  description: id,
  currency: "CAD",
  assetId: "rental",
  reviewed: "no",
  ...extra,
});
test("null is unknown; zero is valid; currencies and entities stay separate", () => {
  const d = fixture();
  assert.equal(totals(assetRows(d, "2026-09")).net, 315000);
  assert.equal(totals(assetRows(d, "2026-09", "all", "USD")).net, 0);
  assert.equal(totals(assetRows(d, "2026-07")).net, null);
  assert.equal(assetRows(d, "2026-09", "holding").length, 0);
  d.valuations[1].debt = null;
  assert.equal(totals(assetRows(d, "2026-09")).net, null);
});
test("history uses dated marks without lookahead and flags carried values", () => {
  const d = fixture();
  assert.equal(assetRows(d, "2026-08")[0].gross, 500000);
  assert.equal(assetRows(d, "2026-10")[0].carried, true);
  assert.equal(assetRows(d, "2026-09")[0].carried, false);
  assert.deepEqual(monthsThrough("2026-01").slice(0, 2), [
    "2025-02",
    "2025-03",
  ]);
});
test("excluded holdings do not inflate consolidated totals", () => {
  const d = fixture();
  d.assets[0].included = "no";
  assert.equal(totals(assetRows(d, "2026-09")).net, null);
  assert.equal(totals(assetRows(d, "2026-09")).count, 0);
});
test("CSV supports BOM, quoted commas, multiline and escaped quotes; malformed fails", () => {
  assert.equal(
    parseCsv('\uFEFFid,name\r\nx,"A, ""B""\nC"').rows[0].name,
    'A, "B"\nC',
  );
  for (const input of [
    'id,name\nx,"oops',
    "id,id\nx,x",
    "id,name\nx",
    'id,name\nx,"ok"oops',
  ])
    assert.throws(() => parseCsv(input));
});
test("reimports replace stable IDs, monthly valuations append, input errors are atomic", () => {
  const d = fixture();
  const csv = "assetId,date,gross,debt\nrental,2026-10-31,520000,190000";
  const first = importCsv(d, "valuations", csv);
  assert.equal(first.added, 1);
  assert.equal(importCsv(first.snapshot, "valuations", csv).replaced, 1);
  assert.equal(first.snapshot.valuations.length, 4);
  assert.throws(() =>
    importCsv(d, "valuations", csv + "\nrental,2026-10-31,1,1"),
  );
  assert.throws(() =>
    importCsv(
      d,
      "valuations",
      "assetId,date,gross,debt\nmissing,2026-10-31,10,0",
    ),
  );
  assert.equal(d.valuations.length, 3);
});
test("strict dates, IDs, enums, values, references and parent cycles", () => {
  for (const patch of [
    { date: "2026-02-30" },
    { gross: -1 },
    { gross: "$20" },
    { gross: Infinity },
  ]) {
    const d = fixture();
    Object.assign(d.valuations[0], patch);
    assert.throws(() => validateFinance(d));
  }
  const d = fixture();
  d.entities[0].parentId = "personal";
  d.entities[1].parentId = "holding";
  assert.throws(() => validateFinance(d));
  const d2 = fixture();
  d2.transactions = [tx("t", "income", 10, { currency: "USD" })];
  assert.throws(() => validateFinance(d2));
});
test("projection strips unknown fields; unsafe URLs and oversized payloads fail closed", () => {
  const d = fixture();
  d.secret = "secret";
  d.assets[0].secret = "secret";
  assert(!JSON.stringify(validateFinance(d)).includes("secret"));
  for (const source of [
    "javascript:alert(1)",
    "https://secret@example.com/",
    "http://example.com",
  ]) {
    d.valuations[0].source = source;
    assert.throws(() => validateFinance(d));
  }
  assert.equal(readFinance().state, "unconfigured");
  assert.equal(readFinance("bad").state, "invalid");
  assert.equal(readFinance("x".repeat(48001)).state, "invalid");
});
test("cash P&L excludes transfers, principal, capital; refunds offset costs; empty months unknown", () => {
  const d = fixture();
  d.transactions = [
    tx("a", "income", 3000),
    tx("b", "fee", -300),
    tx("c", "expense", -500),
    tx("d", "expense", 50),
    tx("e", "principal", -1000),
    tx("f", "capital", -800),
    tx("g", "transfer", 100),
  ];
  const pnl = propertyPnl(d.transactions, "rental", "2026-09", "CAD");
  assert.equal(pnl.at(-1).net, 2250);
  assert.equal(pnl.at(-1).costs, 750);
  assert.equal(pnl.at(-1).excluded, -1700);
  assert.equal(pnl[0].net, null);
});
test("unmatched and currency-mismatched transfers are flagged, true pairs are not", () => {
  const a = tx("a", "transfer", 100, { transferPairId: "p" }),
    b = tx("b", "transfer", -100, { transferPairId: "p", account: "savings" });
  assert.equal(transferWarnings([a, b]), 0);
  assert.equal(transferWarnings([a]), 1);
  assert.equal(transferWarnings([a, { ...b, currency: "USD" }]), 1);
  assert.equal(transferWarnings([a, { ...b, account: "checking" }]), 1);
});
test("spreadsheet exports escape formulas but preserve signed numeric amounts", () => {
  const csv = csvExport("transactions", [
    tx("t", "expense", -5, { description: '=HYPERLINK("unsafe")' }),
  ]);
  assert(csv.includes("\"'=HYPERLINK"));
  assert(csv.includes('"-5"'));
});
test("CSV matches normalized IDs and enforces a restorable combined workspace size", () => {
  const d = fixture();
  const result = importCsv(
    d,
    "valuations",
    "assetId,date,gross,debt\n rental ,2026-09-30 ,520000,190000",
  );
  assert.equal(result.replaced, 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.snapshot.valuations.length, 3);
  const tooLarge = { ...d, untrusted: "x".repeat(2000000) };
  assert.throws(() => validateFinance(tooLarge), /exceeds 2 MB/);
});
test("statement reconciliation respects account, month, entity, currency, nulls and cents", async () => {
  const { reconcileStatements, transactionSummary } = await import(
    "../lib/finance-model.mjs"
  );
  const d = fixture();
  d.transactions = [
    tx("a", "income", 100.25),
    tx("b", "expense", -20.1),
    tx("c", "transfer", -10),
  ];
  d.statements = [
    {
      id: "s",
      entityId: "personal",
      account: "checking",
      institution: "Example Bank",
      currency: "CAD",
      period: "2026-09",
      opening: 1000,
      closing: 1070.15,
    },
  ];
  const checked = validateFinance(d);
  let result = reconcileStatements(checked, "2026-09");
  assert.equal(result[0].difference, 0);
  assert.equal(result[0].status, "Balanced");
  assert.equal(transactionSummary(d.transactions).net, 70.15);
  checked.statements[0].closing = 1071.15;
  assert.equal(reconcileStatements(checked, "2026-09")[0].difference, 1);
  checked.statements[0].opening = null;
  assert.equal(
    reconcileStatements(checked, "2026-09")[0].status,
    "Missing balance",
  );
  assert.equal(reconcileStatements(checked, "2026-09", "holding").length, 0);
  assert.equal(reconcileStatements(checked, "2026-09", "all", "USD").length, 0);
  assert.equal(reconcileStatements(checked, "2026-08").length, 0);
  checked.statements.push({ ...checked.statements[0], id: "duplicate" });
  assert.throws(() => validateFinance(checked), /Duplicate statement/);
});
test("normalized workspace remains within its own restore limit", () => {
  const d = fixture();
  d.updates = Array.from({ length: 10000 }, (_, i) => ({
    id: `u${i}`,
    assetId: "angel",
    date: "2026-09-01",
    title: "x".repeat(100),
  }));
  assert(JSON.stringify(d).length < 2000000);
  assert.throws(() => validateFinance(d), /after normalization/);
});
test("replacement preview counts optional evidence cleared by missing columns", () => {
  const d = fixture();
  d.valuations[1].source = "https://example.com/evidence";
  const result = importCsv(
    d,
    "valuations",
    "assetId,date,gross,debt\nrental,2026-09-30,520000,190000",
  );
  assert.equal(result.clearedFields, 1);
  assert.equal(result.snapshot.valuations[1].source, "");
  assert.equal(d.valuations[1].source, "https://example.com/evidence");
  assert.equal(
    importCsv(
      result.snapshot,
      "valuations",
      "assetId,date,gross,debt\nrental,2026-09-30,520000,190000",
    ).clearedFields,
    0,
  );
});
test("numeric JSON rejects nested values; valid oversized server snapshots fail closed; removal resets baseline", () => {
  const d = fixture();
  d.valuations[0].gross = [100];
  assert.throws(() => validateFinance(d), /plain number/);
  const large = fixture();
  large.events = Array.from({ length: 100 }, (_, i) => ({
    id: `event${i}`,
    assetId: "rental",
    date: "2026-09-01",
    title: "x".repeat(600),
  }));
  const valid = validateFinance(large);
  assert(JSON.stringify(valid).length > 48000);
  assert.equal(readFinance(JSON.stringify(valid)).state, "invalid");
  assert.deepEqual(readFinance(), {
    state: "unconfigured",
    snapshot: emptyFinance(),
  });
});
