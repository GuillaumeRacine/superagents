import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import * as model from "../lib/cash-model.mjs";
import { readCashSnapshot } from "../lib/cash-snapshot.mjs";
import { ackedAgents, contractHash, pyJson } from "../lib/moneyos-contract.mjs";

const {
  SCHEMA,
  emptyCash,
  validateCash,
  readCash,
  entityCash,
  stoicCover,
  debtTotals,
  fundingRows,
  alerts,
  openTasks,
  payableRows,
  contractStatus,
} = model;
const encode = (text) => gzipSync(text).toString("base64");

// Fictional fixture only. Two entities so the no-sum rule can be exercised.
const fixture = () => ({
  schemaVersion: SCHEMA,
  generatedAt: "2026-10-19T12:00:00.000Z",
  feed: { lastPostDate: "2026-10-19", monthlyClosed: "2026-09", owner: "Example owner", channel: "#example" },
  fx: { usdcad: 1.38, asOf: "2026-09-30", source: "example statement" },
  entities: [
    {
      id: "holdco",
      label: "Example Holdco",
      balances: [
        { account: "Bank CAD 1111", currency: "CAD", amount: 100000, asOf: "2026-09-30", source: "stmt" },
        { account: "Bank CAD 2222", currency: "CAD", amount: 20000.5, asOf: "2026-08-31", source: "stmt" },
        { account: "Bank USD 3333", currency: "USD", amount: 500, asOf: "2026-09-30", source: "stmt" },
      ],
    },
    {
      id: "opco",
      label: "Example Opco",
      balances: [{ account: "Bank CAD 4444", currency: "CAD", amount: 1000, asOf: "2026-09-30", source: "stmt" }],
    },
    { id: "newco", label: "Example Newco", note: "account opened; no statement yet", balances: [] },
  ],
  credit: [{ entity: "personal", account: "Line 5555", currency: "CAD", limit: 10000, drawn: 250, asOf: "2026-09-11", source: "stmt" }],
  taxItems: [
    { key: "notice-1", entity: "holdco", kind: "notice", due: null, amountCad: 7000, amountBasis: "parsed from notice text", text: "Example notice CA$7,000", open: true, source: "mail", asOf: "2026-10-19" },
    { key: "inst-1", entity: "holdco", kind: "due", due: "2026-10-31", amountCad: 3000, text: "Example instalment", open: true, source: "package", asOf: "2026-10-19" },
    { key: "inst-2", entity: "holdco", kind: "due", due: "2026-11-30", amountCad: 3000, text: "Example instalment", open: false, source: "package", asOf: "2026-10-19" },
    { key: "personal-1", entity: "personal", kind: "due", due: "2026-10-22", amountCad: 800, text: "Example personal instalment", open: true, source: "reminder", asOf: "2026-10-19" },
  ],
  upcomingCharges: [{ vendor: "Example SaaS", action: "Cancel", amountCad: 12, date: "2026-10-24", entity: "", source: "runbook" }],
  fundingTargets: [
    { id: "rrsp", label: "Example RRSP", targetCad: 10000, deadline: "2027-03-01", contributedCad: null, contributedAsOf: null, status: "open", evidence: "statement" },
    { id: "tfsa", label: "Example TFSA", targetCad: 5000, deadline: null, contributedCad: null, status: "carries" },
    { id: "resp", label: "Example RESP", targetCad: 2500, deadline: "2026-11-30", contributedCad: 500, contributedAsOf: "2026-09-30", status: "open" },
    { id: "late", label: "Example late", targetCad: 100, deadline: "2026-10-01", contributedCad: null, status: "open" },
    { id: "blocked", label: "Example blocked", targetCad: 100, deadline: "2026-12-31", contributedCad: null, status: "blocked" },
  ],
  fundingPlan: { totalCad: 17700, asOf: "2026-10-19", source: "example plan" },
  stoicCover: { entityId: "holdco", cashAsOf: null, claimsAsOf: "2026-10-19", claimKeys: ["notice-1", "inst-1", "inst-2"] },
  debts: [
    { id: "m1", name: "Example mortgage 0001", scope: "personal", lender: "Bank", kind: "mortgage", balanceCad: 100000, balanceAsOf: "2026-09", ratePct: 4, rateNote: "", interestMonthCad: 333.33, interestBasis: "example" },
    { id: "l1", name: "Example line 0002", scope: "personal", lender: "Bank", kind: "line of credit", balanceCad: 50000, balanceAsOf: "2026-08", ratePct: 6, interestMonthCad: null },
    { id: "c1", name: "Example card 0003", scope: "personal", lender: "Bank", kind: "credit card", balanceCad: null, balanceAsOf: null, ratePct: 20, interestMonthCad: null },
  ],
  burn: {
    asOf: "2026-09-21",
    dataThroughPartial: "2026-10-19",
    t30dNetBurnCad: 1234,
    vsYesterday: -10,
    vs30dAgo: 20,
    topCategories: [["Travel", 500], ["Dining", 100]],
    accountsLastDate: { "Example chequing": "2026-10-19", "Example card": "2026-09-21" },
    definition: "example definition",
  },
  scorecard: { asOf: "2026-10-19", lastFullMonth: { month: "2026-08", cad: -2000, source: "ledger" }, trend: "worse", savingsPlanCadMo: 100, savingsBankedCadMo: 0 },
  tasks: [
    { id: "t-done", who: "gui", kind: "cut", title: "Done task", deadline: "2026-10-14", burnCadMo: 50, done: "2026-10-14" },
    { id: "t-late", who: "gui", kind: "cut", title: "Overdue task", deadline: "2026-10-17", burnCadMo: 10, done: null },
    { id: "t-soon", who: "bot", kind: "data", title: "Soon task", deadline: "2026-10-23", burnCadMo: null, done: null },
    { id: "t-far", who: "gui", kind: "setup", title: "Far task", deadline: "2026-12-31", burnCadMo: 0, done: null },
    { id: "t-undated", who: "gui", kind: "decision", title: "Undated task", deadline: null, burnCadMo: 0, done: null },
  ],
});
const TODAY = "2026-10-19";

test("empty snapshot is well-formed and the JSON transport reports states", () => {
  assert.equal(emptyCash().schemaVersion, SCHEMA);
  assert.deepEqual(readCash(undefined), { state: "unconfigured", snapshot: emptyCash() });
  assert.deepEqual(readCash(""), { state: "unconfigured", snapshot: emptyCash() });
  assert.equal(readCash("not JSON").state, "invalid");
  assert.equal(readCash("{}").state, "invalid");
  assert.equal(readCash(JSON.stringify({ schemaVersion: "cash_snapshot_v0" })).state, "invalid");
  assert.equal(readCash(JSON.stringify({ schemaVersion: SCHEMA })).state, "ready");
  assert.equal(readCash(JSON.stringify(fixture())).state, "ready");
});

test("oversized values fail closed on both transports", () => {
  const padded = JSON.stringify(fixture()).padEnd(48001, " ");
  assert.equal(readCash(padded).state, "invalid");
  assert.equal(readCashSnapshot({ json: padded }).state, "invalid");
  const bloated = fixture();
  bloated.tasks = Array.from({ length: 501 }, (_, i) => ({ id: `t${i}`, title: "x" }));
  assert.throws(() => validateCash(bloated), /exceeds 500 rows/);
  const long = fixture();
  long.tasks = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, title: "x".repeat(300), why: "y".repeat(600) }));
  assert.throws(() => validateCash(long), /too large after normalization/);
  assert.equal(readCashSnapshot({ gzipBase64: encode(JSON.stringify(long)) }).state, "invalid");
  assert.equal(readCashSnapshot({ gzipBase64: "A".repeat(48004) }).state, "invalid");
});

test("compressed transport round trips, takes precedence, and never falls back", () => {
  const raw = fixture();
  raw.entities[0].label = "Example Compressed";
  const result = readCashSnapshot({ json: JSON.stringify(fixture()), gzipBase64: encode(JSON.stringify(raw)) });
  assert.equal(result.state, "ready");
  assert.equal(result.snapshot.entities[0].label, "Example Compressed");
  for (const bad of ["", "%%%%", "YQ", encode("not JSON"), encode("{}")])
    assert.deepEqual(readCashSnapshot({ json: JSON.stringify(fixture()), gzipBase64: bad }), { state: "invalid", snapshot: emptyCash() });
  assert.deepEqual(readCashSnapshot({ json: JSON.stringify(fixture()) }), readCash(JSON.stringify(fixture())));
});

test("malformed rows are rejected with a field name", () => {
  const cases = [
    [(r) => (r.entities[0].balances[0].amount = "100,000"), /amount must be a finite number/],
    [(r) => (r.entities[0].balances[0].currency = "cad"), /currency/],
    [(r) => (r.entities[0].balances[0].asOf = "2026-13-01"), /asOf must be an ISO date/],
    [(r) => (r.entities[0].id = "Bad Id"), /id must be a short lowercase id/],
    [(r) => r.entities.push({ id: "holdco", balances: [] }), /Duplicate entity id/],
    [(r) => (r.taxItems[0].kind = "maybe"), /kind must be one of/],
    [(r) => (r.tasks[0].who = "someone"), /who must be one of/],
    [(r) => (r.debts[0].balanceAsOf = "Sep 2026"), /balanceAsOf/],
    [(r) => (r.stoicCover.entityId = "ghost"), /stoicCover.entityId must name an entity/],
    [(r) => (r.burn.topCategories = [["x"]]), /topCategories/],
    [(r) => (r.entities = {}), /entities must be a list/],
    [(r) => (r.fundingTargets[0].targetCad = Infinity), /targetCad/],
    [(r) => (r.fundingTargets[0].targetCad = 1e13), /outside the range/],
  ];
  for (const [mutate, pattern] of cases) {
    const raw = fixture();
    mutate(raw);
    assert.throws(() => validateCash(raw), pattern);
  }
});

test("null handling: blanks become null and are never coerced to zero", () => {
  const raw = fixture();
  raw.entities[0].balances[0].amount = "";
  raw.entities[0].balances[1].amount = undefined;
  raw.fx.usdcad = null;
  raw.debts[0].interestMonthCad = "";
  raw.fundingPlan.totalCad = "";
  const v = validateCash(raw);
  assert.equal(v.entities[0].balances[0].amount, null);
  assert.equal(v.entities[0].balances[1].amount, null);
  assert.equal(v.fx.usdcad, null);
  assert.equal(v.debts[0].interestMonthCad, null);
  assert.equal(v.fundingPlan.totalCad, null);
  // An unknown balance makes the entity's currency total unknown, not smaller.
  assert.deepEqual(entityCash(v.entities[0], "CAD"), { amount: null, asOf: null, accounts: 2 });
  // And an unknown input makes the cover unknown.
  assert.equal(stoicCover(v).cover, null);
  assert.equal(stoicCover(v).plan.amount, null);
  // Zero stays zero; it is a real number.
  const zero = fixture();
  zero.entities[1].balances[0].amount = 0;
  assert.equal(entityCash(validateCash(zero).entities[1], "CAD").amount, 0);
});

test("no-sum rule: cash is derived per entity and per currency only", () => {
  const v = validateCash(fixture());
  assert.deepEqual(entityCash(v.entities[0], "CAD"), { amount: 120000.5, asOf: "2026-08-31", accounts: 2 });
  assert.deepEqual(entityCash(v.entities[0], "USD"), { amount: 500, asOf: "2026-09-30", accounts: 1 });
  assert.deepEqual(entityCash(v.entities[1], "CAD"), { amount: 1000, asOf: "2026-09-30", accounts: 1 });
  assert.deepEqual(entityCash(v.entities[2], "CAD"), { amount: null, asOf: null, accounts: 0 });
  // The model exposes no helper that takes the whole entity list and sums it.
  for (const name of Object.keys(model))
    assert.ok(!/total.*cash|cash.*total|sumEntities|allEntities/i.test(name), `${name} looks like a cross-entity sum`);
  // Cover uses only the named entity's CAD cash, never the other entity's.
  const cover = stoicCover(v);
  assert.equal(cover.cash.amount, 120000.5);
  assert.equal(cover.cash.asOf, "2026-08-31");
  assert.equal(cover.claims.amount, 10000); // closed inst-2 excluded
  assert.equal(cover.claims.items.length, 2);
  assert.equal(cover.plan.amount, 17700);
  assert.equal(cover.cover, 120000.5 - 10000 - 17700);
  // Claims with an unknown amount make the cover unknown.
  const raw = fixture();
  raw.taxItems[0].amountCad = null;
  assert.equal(stoicCover(validateCash(raw)).claims.amount, null);
  assert.equal(stoicCover(validateCash(raw)).cover, null);
  // No cover entity means no cover, not a cover of zero.
  const none = fixture();
  none.stoicCover = {};
  assert.equal(stoicCover(validateCash(none)).cover, null);
});

test("debt totals say how many facilities they cover and ignore unknowns", () => {
  const d = debtTotals(validateCash(fixture()).debts);
  assert.deepEqual(d, {
    facilities: 3,
    balanceCad: 150000,
    balanceRows: 2,
    interestMonthCad: 333.33,
    interestRows: 1,
    blendedRatePct: 4.67,
    asOf: "2026-08",
  });
  assert.equal(debtTotals([]).balanceCad, null);
  assert.equal(debtTotals([]).blendedRatePct, null);
});

test("funding rows compute days to deadline and status tags", () => {
  const rows = fundingRows(validateCash(fixture()), TODAY);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.rrsp.days, 133);
  assert.equal(by.rrsp.tag, "unverified");
  assert.equal(by.rrsp.remaining, null);
  assert.equal(by.tfsa.days, null);
  assert.equal(by.tfsa.tag, "carries");
  assert.equal(by.resp.days, 42);
  assert.equal(by.resp.tag, "due soon");
  assert.equal(by.resp.remaining, 2000);
  assert.equal(by.late.tag, "overdue");
  assert.equal(by.blocked.tag, "blocked");
});

test("alerts cover seven days, open notices, charges and data gaps; tasks sort open first", () => {
  const v = validateCash(fixture());
  const rows = alerts(v, TODAY);
  const texts = rows.map((a) => `${a.kind}:${a.text}`);
  assert.ok(texts.includes("task:Overdue task"));
  assert.ok(texts.includes("task:Soon task"));
  assert.ok(!texts.some((t) => t.includes("Far task")));
  assert.ok(!texts.some((t) => t.includes("Done task")));
  assert.ok(texts.includes("tax notice:Example notice CA$7,000"));
  assert.ok(texts.includes("tax due:Example personal instalment"));
  assert.ok(!texts.some((t) => t.startsWith("tax due:Example instalment")));
  assert.ok(texts.includes("charge:Example SaaS: Cancel (CAD 12)"));
  assert.ok(texts.some((t) => t.startsWith("data:Burn series stuck at 2026-09-21")));
  assert.ok(texts.some((t) => t.startsWith("data:Example Newco: no balance on file")));
  assert.equal(rows[0].days, -2);
  const open = openTasks(v).map((t) => t.id);
  assert.deepEqual(open, ["t-late", "t-soon", "t-far", "t-undated"]);
});

test("optional series, debt service and corporate-move fields validate and stay backward compatible", () => {
  const old = validateCash(fixture());
  assert.deepEqual(old.burn.series, []);
  assert.equal(old.burn.debtService, null);
  assert.equal(old.scorecard.corpMovedCount, null);
  const r = fixture();
  r.burn.series = [["2026-10-02", 20], ["2026-10-01", 10]];
  r.burn.debtService = { start: "2026-09-01", end: "2026-09-30", interestCad: 50, principalCad: 40, feesCad: 0, totalCad: 90, note: "example" };
  Object.assign(r.scorecard, { corpMovedCount: 3, corpTotalCount: 12, corpMovedCadMo: 30, corpTotalCadMo: 120 });
  const v = validateCash(r);
  assert.deepEqual(v.burn.series, [["2026-10-01", 10], ["2026-10-02", 20]]);
  assert.equal(v.burn.debtService.principalCad, 40);
  assert.equal(v.scorecard.corpTotalCount, 12);
  assert.equal(readCash(JSON.stringify(v)).state, "ready");
  for (const bad of ["x", [["2026-13-01", 1]], [["2026-10-01"]], Array(401).fill(["2026-10-01", 1])]) {
    const b = fixture();
    b.burn.series = bad;
    assert.throws(() => validateCash(b), /series/);
  }
});

test("freshness flags a snapshot older than 36h and any input older than 3 days", () => {
  const now = (iso) => Date.parse(iso);
  const r = fixture();
  r.burn.asOf = "2026-10-18";
  const v = validateCash(r);
  assert.equal(model.freshness(v, now("2026-10-19T20:00:00Z")).stale, false);
  const late = model.freshness(v, now("2026-10-21T01:00:00Z"));
  assert.ok(late.reasons.some((x) => /hours ago/.test(x)));
  const stale = model.freshness(validateCash(fixture()), now("2026-10-19T13:00:00Z"));
  assert.ok(stale.stale);
  assert.ok(stale.reasons.some((x) => /Burn data: as of 2026-09-21, 28 days old/.test(x)));
  assert.ok(model.freshness(emptyCash()).stale);
});

// MoneyOS record sections (issue #54). Fictional values only.
const moneyos = () => ({
  books: { suspenseCad: -1234.5, trialBalanceCad: 0, balanced: true, tieOutsPassing: 40, tieOutsFailing: 2, asOf: "2026-10-31" },
  payables: [
    { id: "P01", priority: 1, type: "payable", entity: "personal", counterparty: "Example Utility", description: "Example bill", amount: 100, currency: "CAD", dueDate: "2026-10-17", status: "open", source: "statement", lastChecked: "2026-10-19" },
    { id: "P02", priority: 2, type: "payable", entity: "holdco", counterparty: "Example Vendor", description: "Example invoice", amount: 50, currency: "USD", dueDate: "2026-10-30", status: "open (estimate)", lastChecked: "2026-10-19" },
    { id: "P03", priority: 3, type: "payable", entity: "personal", counterparty: "Example Card", amount: null, dueDate: null, dueNote: "next statement", status: "MISSING", lastChecked: "2026-10-19" },
    { id: "R01", priority: 4, type: "receivable", entity: "personal", counterparty: "Example Opco", description: "Reimbursement", amount: 300, currency: "CAD", dueDate: "2026-12-31", status: "accrued", lastChecked: "2026-10-19" },
  ],
  clarify: { openToClarifyRows: 12, openQuestions: 3, batches: 2, asOf: "2026-10-18" },
  contract: { version: "2.0.0", hash: "0123456789ab", date: "2026-10-12", requiredAcks: ["Agent A", "Agent B", "Agent C"], ackedAgents: ["Agent A", "Agent C"], graceUntil: "2026-10-19" },
  cabin: { lastStatementMonth: "2026-09", nights: 11, grossCad: 2500, salesTaxesCad: 200, depositCad: 1200, netExTaxCad: 950, statementsOnFile: 9 },
});
const withMoneyos = () => {
  const r = { ...fixture(), ...moneyos() };
  r.scorecard.savingsRate = { month: "2026-09", monthRatePct: -12.5, monthStatus: "provisional", t12Label: "T12 2025-10 to 2026-09", t12RatePct: 4, definition: "(income − opex) / income", asOf: "2026-09-30", source: "example csv" };
  return r;
};

test("MoneyOS sections are optional, validate, and round-trip", () => {
  const old = validateCash(fixture());
  assert.equal(old.books, null);
  assert.deepEqual(old.payables, []);
  assert.equal(old.clarify, null);
  assert.equal(old.contract, null);
  assert.equal(old.cabin, null);
  assert.equal(old.scorecard.savingsRate, null);
  const v = validateCash(withMoneyos());
  assert.equal(v.scorecard.savingsRate.monthRatePct, -12.5);
  assert.equal(v.scorecard.savingsRate.asOf, "2026-09-30");
  assert.equal(v.books.balanced, true);
  assert.equal(v.books.tieOutsFailing, 2);
  assert.equal(v.payables.length, 4);
  assert.equal(v.payables[2].currency, "CAD"); // blank currency defaults; the amount stays null
  assert.equal(v.payables[2].amount, null);
  assert.equal(v.payables[2].dueNote, "next statement");
  assert.equal(v.clarify.openToClarifyRows, 12);
  assert.deepEqual(v.contract.requiredAcks, ["Agent A", "Agent B", "Agent C"]);
  assert.equal(v.cabin.netExTaxCad, 950);
  assert.equal(readCash(JSON.stringify(v)).state, "ready");
  assert.deepEqual(validateCash(JSON.parse(JSON.stringify(v))), v);
});

test("MoneyOS sections: null means unknown and is never coerced", () => {
  const r = withMoneyos();
  r.books = { suspenseCad: "", trialBalanceCad: null, balanced: null, tieOutsPassing: undefined, tieOutsFailing: "", asOf: "" };
  r.clarify = { openToClarifyRows: null, openQuestions: "", batches: null, asOf: null };
  r.contract = { version: "", hash: null, date: null, requiredAcks: [], ackedAgents: [], graceUntil: null };
  r.cabin = { lastStatementMonth: null, nights: "", grossCad: null, salesTaxesCad: null, depositCad: null, netExTaxCad: null, statementsOnFile: null };
  r.scorecard.savingsRate = { month: null, monthRatePct: "", t12RatePct: null, asOf: null };
  const v = validateCash(r);
  assert.deepEqual(v.books, { suspenseCad: null, trialBalanceCad: null, balanced: null, tieOutsPassing: null, tieOutsFailing: null, asOf: null });
  assert.deepEqual(v.clarify, { openToClarifyRows: null, openQuestions: null, batches: null, asOf: null });
  assert.equal(v.contract.hash, null);
  assert.equal(v.cabin.nights, null);
  assert.equal(v.scorecard.savingsRate.monthRatePct, null);
  assert.equal(v.scorecard.savingsRate.t12RatePct, null);
  // Zero stays zero.
  const z = withMoneyos();
  z.books.suspenseCad = 0;
  z.clarify.openQuestions = 0;
  assert.equal(validateCash(z).books.suspenseCad, 0);
  assert.equal(validateCash(z).clarify.openQuestions, 0);
  // No contract section means nothing to report, not a failing contract.
  assert.deepEqual(contractStatus(validateCash(fixture()), TODAY), { missing: [], afterGrace: false, overdue: false });
});

test("MoneyOS sections: over-cap rows, bad dates and bad shapes are rejected with a field name", () => {
  const cases = [
    [(r) => (r.payables = Array.from({ length: 31 }, (_, i) => ({ id: `P${i}` }))), /payables exceeds 30 rows/],
    [(r) => (r.payables[0].dueDate = "2026-13-40"), /payables\[0\].dueDate must be an ISO date/],
    [(r) => (r.payables[0].lastChecked = "yesterday"), /payables\[0\].lastChecked/],
    [(r) => (r.payables[0].currency = "cad"), /payables\[0\].currency/],
    [(r) => (r.payables[0].type = "loan"), /payables\[0\].type must be one of/],
    [(r) => (r.payables[0].description = "x".repeat(241)), /description is longer than 240/],
    [(r) => (r.payables[0].priority = 1.5), /priority must be a whole number/],
    [(r) => r.payables.push({ ...r.payables[0] }), /Duplicate payable id/],
    [(r) => (r.payables = {}), /payables must be a list/],
    [(r) => (r.books.balanced = "yes"), /books.balanced must be true, false or null/],
    [(r) => (r.books.tieOutsPassing = -1), /books.tieOutsPassing must be a whole number/],
    [(r) => (r.books.asOf = "2026-10"), /books.asOf must be an ISO date/],
    [(r) => (r.clarify.openQuestions = 2.5), /clarify.openQuestions/],
    [(r) => (r.clarify.asOf = "Oct 18"), /clarify.asOf/],
    [(r) => (r.contract.hash = "XYZ"), /contract.hash must be 12 lowercase hex/],
    [(r) => (r.contract.graceUntil = "2026-02-30"), /contract.graceUntil/],
    [(r) => (r.contract.requiredAcks = Array.from({ length: 21 }, (_, i) => `a${i}`)), /contract.requiredAcks exceeds 20/],
    [(r) => (r.contract.ackedAgents = "Claude"), /contract.ackedAgents must be a list/],
    [(r) => (r.cabin.lastStatementMonth = "2026-09-01x"), /cabin.lastStatementMonth/],
    [(r) => (r.cabin.nights = 3.3), /cabin.nights must be a whole number/],
    [(r) => (r.cabin.grossCad = "2,500"), /cabin.grossCad must be a finite number/],
    [(r) => (r.scorecard.savingsRate.month = "2026-9"), /scorecard.savingsRate.month/],
    [(r) => (r.scorecard.savingsRate.asOf = "2026-09"), /scorecard.savingsRate.asOf must be an ISO date/],
    [(r) => (r.scorecard.savingsRate.definition = "d".repeat(401)), /savingsRate.definition is longer than 400/],
    [(r) => (r.scorecard.savingsRate.monthRatePct = "−12%"), /monthRatePct must be a finite number/],
    [(r) => (r.books = []), /books must be an object/],
  ];
  for (const [mutate, pattern] of cases) {
    const raw = withMoneyos();
    mutate(raw);
    assert.throws(() => validateCash(raw), pattern);
  }
});

test("payable rows tag overdue, due soon and unverified; overdue first", () => {
  const rows = payableRows(validateCash(withMoneyos()), TODAY);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.P01.tag, "overdue");
  assert.equal(by.P01.days, -2);
  assert.equal(by.P02.tag, "due soon");
  assert.equal(by.P02.days, 11);
  assert.equal(by.P03.tag, "unverified");
  assert.equal(by.P03.days, null);
  assert.equal(by.R01.tag, "");
  assert.deepEqual(rows.map((r) => r.id), ["P01", "P02", "R01", "P03"]);
  // A free-text "overdue" due date counts as overdue even without a date.
  const r = withMoneyos();
  r.payables[2].dueNote = "overdue";
  assert.equal(payableRows(validateCash(r), TODAY).find((p) => p.id === "P03").tag, "overdue");
});

test("contract status names missing acknowledgements and turns red only after grace", () => {
  const v = validateCash(withMoneyos());
  assert.deepEqual(contractStatus(v, "2026-10-19"), { missing: ["Agent B"], afterGrace: false, overdue: false });
  assert.deepEqual(contractStatus(v, "2026-10-20"), { missing: ["Agent B"], afterGrace: true, overdue: true });
  const all = withMoneyos();
  all.contract.ackedAgents = ["Agent A", "Agent B", "Agent C"];
  assert.equal(contractStatus(validateCash(all), "2026-12-01").overdue, false);
});

test("freshness flags a savings rate older than 45 days", () => {
  const now = Date.parse("2026-10-19T13:00:00Z");
  const r = withMoneyos();
  r.burn.asOf = "2026-10-18";
  r.scorecard.savingsRate.asOf = "2026-09-30";
  assert.equal(model.freshness(validateCash(r), now).reasons.some((x) => /Savings rate/.test(x)), false);
  r.scorecard.savingsRate.asOf = "2026-08-31";
  const f = model.freshness(validateCash(r), now);
  assert.ok(f.stale);
  assert.ok(f.reasons.some((x) => /Savings rate: as of 2026-08-31, 49 days old \(limit 45\)/.test(x)));
  r.scorecard.savingsRate.asOf = null;
  assert.ok(model.freshness(validateCash(r), now).reasons.some((x) => /Savings rate: date unknown/.test(x)));
});

test("contract hash reproduces Python json.dumps(sort_keys=True, ensure_ascii=False) byte for byte", () => {
  // Expected strings were produced with python3 json.dumps on the same inputs (JSON-encoded here).
  const cases = [
    [{ b: 1, a: [1, "x", null, true, false], c: { z: "é—ü", y: 'q"\\\n\t\u0001\u007f' } }, "{\"a\": [1, \"x\", null, true, false], \"b\": 1, \"c\": {\"y\": \"q\\\"\\\\\\n\\t\\u0001\u007f\", \"z\": \"é—ü\"}}"],
    [{ next_question_id: 24, k: "v" }, "{\"k\": \"v\", \"next_question_id\": 24}"],
    [[], "[]"],
    [{}, "{}"],
    ["plain", "\"plain\""],
    [{ sheets: { x: { id: "1abc", tabs: { T: ["a", "b"] } } }, _doc: "ü" }, "{\"_doc\": \"ü\", \"sheets\": {\"x\": {\"id\": \"1abc\", \"tabs\": {\"T\": [\"a\", \"b\"]}}}}"],
  ];
  for (const [input, expected] of cases) assert.equal(pyJson(input), JSON.parse(JSON.stringify(expected)));
  assert.throws(() => pyJson({ x: 1.5 }), /non-integer/);
  // python3: hashlib.sha256(b"# contract\n" + b'{"contract_version": "2.0.0"}').hexdigest()[:12]
  const sot = Buffer.from("# contract\n", "utf8");
  const a = contractHash(sot, JSON.stringify({ contract_version: "2.0.0", next_question_id: 1 }));
  assert.equal(a, "d4158a88744d");
  // next_question_id is dropped, so bumping it does not force a re-acknowledgement.
  assert.equal(a, contractHash(sot, JSON.stringify({ next_question_id: 99, contract_version: "2.0.0" })));
  assert.notEqual(a, contractHash(sot, JSON.stringify({ contract_version: "2.0.1" })));
  const ack = "# Acks\n\n| agent | date | contract_hash | note |\n|---|---|---|---|\n| Agent A | 2026-10-12 | 0123456789ab | ok |\n| Agent B | 2026-10-01 | ffffffffffff | old |\n| Agent A | 2026-09-01 | ffffffffffff | older |\n";
  assert.deepEqual(ackedAgents(ack, "0123456789ab"), ["Agent A"]);
  assert.deepEqual(ackedAgents(ack, null), []);
  assert.deepEqual(ackedAgents("", "0123456789ab"), []);
});
