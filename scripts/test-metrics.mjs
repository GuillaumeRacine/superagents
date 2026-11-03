import assert from "node:assert/strict";
import { test } from "node:test";
import * as model from "../lib/metrics-model.mjs";
import { metricsFixture } from "./fixtures/metrics-fixture.mjs";

const {
  SCHEMA,
  CAPS,
  MAX_JSON_BYTES,
  emptyMetrics,
  validateMetrics,
  readMetricsText,
  mask,
  metricsFreshness,
  accountStale,
  savingsVerdict,
  sharePct,
  runwayText,
  entityCashText,
  metricsPayableRows,
  metricsFundingRows,
  metricsContractStatus,
  needsYou,
  debtsByEntity,
} = model;
const TODAY = "2026-10-19";
const fixture = () => metricsFixture("Example");

test("empty metrics are well-formed; the schema line is enforced; every block is optional", () => {
  assert.equal(emptyMetrics().schema, SCHEMA);
  assert.throws(() => validateMetrics({}), /schema must be moneyos_metrics_v1/);
  assert.throws(() => validateMetrics({ schema: "moneyos_metrics_v0" }), /schema/);
  assert.throws(() => validateMetrics([]), /must be an object/);
  const minimal = validateMetrics({ schema: SCHEMA });
  assert.deepEqual(minimal, emptyMetrics());
  // Explicit nulls for every block are the same as absence.
  const nulls = validateMetrics({ schema: SCHEMA, burn: null, debts: null, north_star: { savings_rate: null }, payables: null, freshness: null, sources: null });
  assert.deepEqual(nulls, emptyMetrics());
});

test("the fictional fixture validates and round-trips through its own validator", () => {
  const v = validateMetrics(fixture());
  assert.equal(v.moneyos_sha, "abc1234def");
  assert.equal(v.inputs_hash, "0a1b2c3d4e5f");
  assert.equal(v.built_from_head, "fedcba9876");
  assert.equal(v.verdicts_as_of, "2026-10-19T11:30:00Z");
  assert.deepEqual(v.liquidity.by_entity[2].missing_accounts, ["1111", "4444"]);
  assert.equal(v.debts.rows[2].kind, "overdraft");
  // moneyos_sha is optional: a file without it is still ready.
  const noSha = fixture();
  delete noSha.moneyos_sha;
  assert.equal(validateMetrics(noSha).moneyos_sha, null);
  assert.equal(readMetricsText(JSON.stringify(noSha)).state, "ready");
  assert.equal(v.north_star.savings_rate.rate_pct, -12.5);
  assert.equal(v.pnl_monthly.length, 3);
  assert.equal(v.payables.length, 3);
  assert.deepEqual(v.burn.series.map((p) => p[0]), ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]); // sorted
  assert.deepEqual(v.interest_by_month[0].by_account, [["0002", 500], ["0836", 1000]]); // normalized pairs, sorted
  assert.deepEqual(v.sources[0], ["debts.csv", "2026-09-30"]);
  assert.deepEqual(validateMetrics(JSON.parse(JSON.stringify(v))), v);
  assert.equal(readMetricsText(JSON.stringify(fixture())).state, "ready");
});

test("null handling: blanks become null and are never coerced to zero; zero stays zero", () => {
  const r = fixture();
  r.north_star.savings_rate.rate_pct = "";
  r.north_star.savings_rate.income_cad = undefined;
  r.burn.t30d_net_burn_cad = null;
  r.debts.total_cad = "";
  r.liquidity.by_entity[0].cash = "";
  r.books.tieouts.ties = null;
  r.open_items.open_questions = "";
  r.cabin.nights = "";
  r.funding.targets[0].target_cad = "";
  const v = validateMetrics(r);
  assert.equal(v.north_star.savings_rate.rate_pct, null);
  assert.equal(v.north_star.savings_rate.income_cad, null);
  assert.equal(v.burn.t30d_net_burn_cad, null);
  assert.equal(v.debts.total_cad, null);
  assert.equal(v.liquidity.by_entity[0].cash, null);
  assert.equal(v.books.tieouts.ties, null);
  assert.equal(v.open_items.open_questions, null);
  assert.equal(v.cabin.nights, null);
  assert.equal(v.funding.targets[0].target_cad, null);
  // Derivations stay unknown rather than shrinking.
  assert.equal(sharePct(v.north_star.savings_rate.crypto_cad, v.north_star.savings_rate.income_cad), null);
  assert.equal(metricsFundingRows(v, TODAY)[0].remaining, null);
  const z = fixture();
  z.burn.t30d_net_burn_cad = 0;
  z.open_items.open_questions = 0;
  z.books.suspense_cad = 0;
  const vz = validateMetrics(z);
  assert.equal(vz.burn.t30d_net_burn_cad, 0);
  assert.equal(vz.open_items.open_questions, 0);
  assert.equal(vz.books.suspense_cad, 0);
  // A null status or type stays null (rendered unknown) and never enters the week's list.
  const nulls = fixture();
  nulls.funding.targets[1].status = null; // was blocked
  nulls.payables[0].type = ""; // was the overdue payable
  const vn = validateMetrics(nulls);
  assert.equal(vn.funding.targets[1].status, null);
  assert.equal(vn.payables[0].type, null);
  const fr = Object.fromEntries(metricsFundingRows(vn, TODAY).map((f) => [f.id, f]));
  assert.equal(fr.blocked.tag, null);
  assert.equal(fr.rrsp.tag, "unverified"); // the cash-model rules still apply to the open row
  const kinds = needsYou(vn, "2026-10-20").map((a) => a.kind);
  assert.ok(!kinds.includes("funding blocked") && !kinds.includes("payable"), kinds.join());
  // Zero open questions is not an item for the week; three is one line, not three.
  assert.ok(!needsYou(vz, TODAY).some((a) => a.kind === "ruling"));
  assert.equal(needsYou(validateMetrics(fixture()), TODAY).filter((a) => a.kind === "ruling").length, 1);
});

test("masking is re-applied on read: any run of five or more digits keeps its last four", () => {
  assert.equal(mask("acct 1234567 and 98765"), "acct ...4567 and ...8765");
  assert.equal(mask("2026-10-19 CA$7,000 1234"), "2026-10-19 CA$7,000 1234");
  const r = fixture();
  r.payables[0].description = "Example bill 1234567";
  r.debts.rows[0].name = "Mortgage 00123456789";
  r.income_by_source_t12[0].source = "Transfer from 987654321";
  r.interest_by_month[0].by_account = { 123456789: 10 };
  r.liquidity.by_entity[0].source = "Bank 123456 stmt";
  r.freshness[0].label = "Chequing 5551234";
  const v = validateMetrics(r);
  assert.equal(v.payables[0].description, "Example bill ...4567");
  assert.equal(v.debts.rows[0].name, "Mortgage ...6789");
  assert.equal(v.income_by_source_t12[0].source, "Transfer from ...4321");
  assert.deepEqual(v.interest_by_month[0].by_account, [["...6789", 10]]);
  assert.equal(v.liquidity.by_entity[0].source, "Bank ...3456 stmt");
  assert.equal(v.freshness[0].label, "Chequing ...1234");
  // A bad value under a digit-heavy source key: the error names the masked, clipped key, never the raw one.
  const key = fixture();
  key.sources = { ["statement-123456789-" + "k".repeat(60)]: 12 };
  assert.throws(() => validateMetrics(key), (e) => /^sources\.statement-\.\.\.6789-k{22} must be text\.$/.test(e.message) && !/123456789/.test(e.message));
  // Every text field is masked; hex identifiers (contract hash, commit sha) are the only exemption.
  const strings = [];
  JSON.stringify(v, (key, value) => (typeof value === "string" && !["hash", "moneyos_sha"].includes(key) ? strings.push(value) : null, value));
  assert.ok(!strings.some((x) => /\d{5,}/.test(x)), "no five-digit run survives in any text field");
  assert.equal(v.contract.hash, "0123456789ab");
  // A freshness last4 that is not last-four is rejected rather than masked.
  const bad = fixture();
  bad.freshness[0].last4 = "123456";
  assert.throws(() => validateMetrics(bad), /freshness\[0\].last4 must keep at most four digits/);
});

test("row caps and the size cap are enforced with the field name", () => {
  const over = (n) => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, month: `2026-${String((i % 12) + 1).padStart(2, "0")}` }));
  const cases = [
    [(r) => (r.freshness = over(CAPS.freshness + 1)), /freshness exceeds 60 rows/],
    [(r) => (r.pnl_monthly = Array.from({ length: CAPS.pnl_monthly + 1 }, (_, i) => ({ month: `20${String(10 + i)}-01` }))), /pnl_monthly exceeds 14 rows/],
    [(r) => (r.income_by_source_t12 = over(CAPS.income_by_source_t12 + 1)), /income_by_source_t12 exceeds 20 rows/],
    [(r) => (r.spend_by_line.rows = over(CAPS.spend_rows + 1)), /spend_by_line.rows exceeds 40 rows/],
    [(r) => (r.interest_by_month = Array.from({ length: CAPS.interest_by_month + 1 }, (_, i) => ({ month: `20${String(10 + i)}-01` }))), /interest_by_month exceeds 14 rows/],
    [(r) => (r.interest_by_month[0].by_account = Object.fromEntries(Array.from({ length: CAPS.interest_accounts + 1 }, (_, i) => [`a${i}`, 1]))), /by_account exceeds 30 accounts/],
    [(r) => (r.debts.rows = over(CAPS.debts + 1)), /debts.rows exceeds 30 rows/],
    [(r) => (r.payables = over(CAPS.payables + 1)), /payables exceeds 40 rows/],
    [(r) => (r.burn.series = Array(CAPS.series + 1).fill(["2026-10-01", 1])), /burn.series exceeds 400 points/],
    [(r) => (r.liquidity.by_entity = over(CAPS.entities + 1)), /liquidity.by_entity exceeds 20 rows/],
    [(r) => (r.funding.targets = over(CAPS.funding + 1)), /funding.targets exceeds 20 rows/],
    [(r) => (r.contract.required = Array.from({ length: CAPS.agents + 1 }, (_, i) => `a${i}`)), /contract.required exceeds 20 names/],
    [(r) => (r.sources = Object.fromEntries(Array.from({ length: CAPS.sources + 1 }, (_, i) => [`f${i}`, "x"]))), /sources exceeds 40 entries/],
  ];
  for (const [mutate, pattern] of cases) {
    const r = fixture();
    mutate(r);
    assert.throws(() => validateMetrics(r), pattern);
  }
  // Within caps but bloated text: the normalized size cap.
  const big = fixture();
  big.payables = Array.from({ length: CAPS.payables }, (_, i) => ({ id: `P${i}`, description: "d".repeat(240), status: "s".repeat(80), counterparty: "c".repeat(120) }));
  big.spend_by_line.rows = Array.from({ length: CAPS.spend_rows }, (_, i) => ({ line: `${i} ${"l".repeat(116)}` }));
  big.freshness = Array.from({ length: CAPS.freshness }, (_, i) => ({ last4: "1111", label: `${i} ${"x".repeat(76)}` }));
  big.debts.rows = Array.from({ length: CAPS.debts }, (_, i) => ({ id: `d${i}`, name: "n".repeat(120) }));
  big.pnl_monthly = [];
  // 40×440 + 40×120 + 60×80 + 30×120 ≈ 31 KB: still under 200 KB, so this must validate; the raw bound is on the transport.
  assert.equal(readMetricsText(JSON.stringify(big)).state, "ready");
  const huge = JSON.stringify(fixture()).padEnd(MAX_JSON_BYTES + 1, " ");
  assert.deepEqual(readMetricsText(huge), { state: "fallback", reason: "file larger than 200 KB", metrics: emptyMetrics() });
  assert.equal(readMetricsText("").state, "fallback");
  assert.equal(readMetricsText("{nope").reason, "file is not valid JSON");
  assert.match(readMetricsText(JSON.stringify({ schema: SCHEMA, burn: { as_of: "yesterday" } })).reason, /^validation: burn.as_of must be an ISO date/);
});

test("bad dates, bad shapes and bad enums are rejected with a field name", () => {
  const cases = [
    [(r) => (r.generated_at = "2026-10-19"), /generated_at must be an ISO date-time/],
    [(r) => (r.generated_at = "not a time"), /generated_at/],
    [(r) => (r.ledger_through = "2026-13-01"), /ledger_through must be an ISO date/],
    [(r) => (r.moneyos_sha = "ZZZ"), /moneyos_sha must be 7 to 40 lowercase hex/],
    [(r) => (r.inputs_hash = "0a1b2c3d4e5"), /inputs_hash must be 12 lowercase hex/],
    [(r) => (r.built_from_head = "HEAD"), /built_from_head must be 7 to 40 lowercase hex/],
    [(r) => (r.verdicts_as_of = "2026-10-19"), /verdicts_as_of must be an ISO date-time/],
    [(r) => (r.liquidity.by_entity[2].missing_accounts = "1111"), /liquidity.by_entity\[2\].missing_accounts must be a list/],
    [(r) => (r.liquidity.by_entity[2].missing_accounts = ["123456"]), /missing_accounts\[0\] must keep at most four digits/],
    [(r) => (r.north_star.savings_rate.month = "2026-9"), /north_star.savings_rate.month must be an ISO date or month/],
    [(r) => (r.north_star.savings_rate.status = "draft"), /status must be one of provisional, final/],
    [(r) => (r.north_star.savings_rate.rate_pct = "−12%"), /rate_pct must be a finite number/],
    [(r) => (r.burn.series = [["2026-02-30", 1]]), /burn.series.date must be an ISO date/],
    [(r) => (r.burn.series = [["2026-02-01"]]), /burn.series rows must be \[date, amount\]/],
    [(r) => (r.pnl_monthly[0].month = "Sep 2026"), /pnl_monthly\[0\].month/],
    [(r) => r.pnl_monthly.push({ ...r.pnl_monthly[0] }), /Duplicate pnl_monthly month 2026-09/],
    [(r) => (r.pnl_monthly = {}), /pnl_monthly must be a list/],
    [(r) => (r.debts.rows[0].as_of = "2026/09/30"), /debts.rows\[0\].as_of/],
    [(r) => r.debts.rows.push({ ...r.debts.rows[0] }), /Duplicate debt id m1/],
    [(r) => (r.debts = []), /debts must be an object/],
    [(r) => (r.liquidity.by_entity[0].currency = "cad"), /liquidity.by_entity\[0\].currency must be a three-letter/],
    [(r) => (r.net_worth.by_entity[0].confidence = "certain"), /confidence must be one of low, medium, high/],
    [(r) => (r.funding.targets[0].status = "maybe"), /funding.targets\[0\].status must be one of/],
    [(r) => (r.funding.targets[0].deadline = "2027-3-1"), /funding.targets\[0\].deadline must be an ISO date/],
    [(r) => (r.payables[0].type = "loan"), /payables\[0\].type must be one of/],
    [(r) => (r.payables[0].due_date = "overdue"), /payables\[0\].due_date must be an ISO date/],
    [(r) => (r.payables[0].priority = 1.5), /payables\[0\].priority must be a whole number/],
    [(r) => (r.payables[0].description = "x".repeat(241)), /description is longer than 240/],
    [(r) => (r.cabin.last_statement_month = "2026-09-01x"), /cabin.last_statement_month/],
    [(r) => (r.cabin.t12.nights = -1), /cabin.t12.nights must be a whole number/],
    [(r) => (r.books.balanced = "yes"), /books.balanced must be true, false or null/],
    [(r) => (r.books.tieouts = "40/42"), /books.tieouts must be an object/],
    [(r) => (r.open_items.oldest_open = "last week"), /open_items.oldest_open/],
    [(r) => (r.contract.hash = "XYZ"), /contract.hash must be 12 lowercase hex/],
    [(r) => (r.contract.grace_until = "2026-02-30"), /contract.grace_until/],
    [(r) => (r.contract.acked = "Claude"), /contract.acked must be a list/],
    [(r) => (r.freshness[0].stale = "yes"), /freshness\[0\].stale must be true, false or null/],
    [(r) => (r.freshness[0].newest_row = "2026-10-32"), /freshness\[0\].newest_row must be an ISO date/],
    [(r) => (r.freshness[0].cadence_days = 2.5), /freshness\[0\].cadence_days must be a whole number/],
    [(r) => (r.sources = "ledger"), /sources must be an object/],
    [(r) => (r.spend_by_line.rows[0].month_cad = Infinity), /spend_by_line.rows\[0\].month_cad/],
    [(r) => (r.spend_by_line.rows[0].month_cad = 1e13), /outside the range/],
    [(r) => (r.income_by_source_t12[0].source = 12), /income_by_source_t12\[0\].source must be text/],
    // Normalized pair forms: a malformed pair is a shape error, never rewritten.
    [(r) => (r.interest_by_month[0].by_account = [["0836", 1], ["0002"]]), /interest_by_month\[0\].by_account\[1\] must be a \[key, value\] pair/],
    [(r) => (r.sources = [["ledger.csv", "2026-10-18"], "debts.csv"]), /sources\[1\] must be a \[key, value\] pair/],
  ];
  for (const [mutate, pattern] of cases) {
    const r = fixture();
    mutate(r);
    assert.throws(() => validateMetrics(r), pattern);
  }
});

test("freshness verdict: file age, ledger, burn and savings-rate inputs; stale accounts counted, not alarmed", () => {
  const v = validateMetrics(fixture());
  const now = (iso) => Date.parse(iso);
  const ok = metricsFreshness(v, now("2026-10-19T20:00:00Z"));
  assert.equal(ok.stale, false, ok.reasons.join(" "));
  assert.equal(ok.accounts, 4);
  assert.equal(ok.staleAccounts, 2); // 2222 flagged by the record; 4444 by cadence arithmetic; 3333 within 31 days
  const old = metricsFreshness(v, now("2026-10-21T01:00:00Z"));
  assert.ok(old.stale);
  assert.ok(old.reasons.some((x) => /generated 37 hours ago \(limit 36\)/.test(x)));
  const burnOld = fixture();
  burnOld.generated_at = "2026-10-25T08:00:00Z";
  burnOld.burn.as_of = "2026-10-18";
  burnOld.ledger_through = "2026-10-24";
  const f = metricsFreshness(validateMetrics(burnOld), now("2026-10-25T09:00:00Z"));
  assert.ok(f.reasons.some((x) => /Burn: through 2026-10-18, 7 days old \(limit 3\)/.test(x)));
  assert.ok(!f.reasons.some((x) => /Ledger/.test(x)));
  const srOld = fixture();
  srOld.generated_at = "2026-12-01T08:00:00Z";
  srOld.ledger_through = "2026-11-30";
  srOld.burn.as_of = "2026-11-30";
  const g = metricsFreshness(validateMetrics(srOld), now("2026-12-01T09:00:00Z"));
  assert.ok(g.reasons.some((x) => /Savings rate: through 2026-09-30, 62 days old \(limit 45\)/.test(x)));
  assert.ok(metricsFreshness(emptyMetrics(), now("2026-10-19T20:00:00Z")).reasons.includes("Generated time is unknown."));
  // The caller's calendar date drives the day arithmetic: 01:00Z on the 20th is still the 19th in Toronto.
  const utc = metricsFreshness(v, now("2026-10-20T01:00:00Z"));
  const toronto = metricsFreshness(v, now("2026-10-20T01:00:00Z"), "2026-10-19");
  assert.ok(utc.reasons.some((x) => /^Ledger: through 2026-10-18, 2 days old/.test(x)) === false && utc.staleAccounts === 2);
  assert.equal(toronto.staleAccounts, 2);
  assert.equal(metricsFreshness(v, now("2026-10-22T01:00:00Z"), "2026-10-21").staleAccounts, 2);
  assert.equal(metricsFreshness(v, now("2026-10-22T01:00:00Z"), "2026-10-22").staleAccounts, 3); // 1111: 4 days > cadence 3
  // Account staleness is recomputed against today; the record's flag counts only when a date or cadence is missing.
  assert.equal(accountStale({ stale: true, newest_row: "2026-10-19", cadence_days: 1 }, TODAY), false);
  assert.equal(accountStale({ stale: false, newest_row: "2026-01-01", cadence_days: 1 }, TODAY), true);
  assert.equal(accountStale({ stale: null, newest_row: "2026-10-01", cadence_days: 10 }, TODAY), true);
  assert.equal(accountStale({ stale: null, newest_row: "2026-10-09", cadence_days: 10 }, TODAY), false);
  assert.equal(accountStale({ stale: true, newest_row: "2026-10-01", cadence_days: null }, TODAY), true);
  assert.equal(accountStale({ stale: null, newest_row: null, cadence_days: 3 }, TODAY), false);
  assert.equal(accountStale({ stale: false, newest_row: null, cadence_days: 3 }, TODAY), false);
  // A file older than 14 days is abandoned, not merely stale.
  assert.equal(ok.abandoned, false);
  const gone = metricsFreshness(v, now("2026-11-03T12:00:00Z"));
  assert.equal(gone.generatedDays, 15);
  assert.equal(gone.abandoned, true);
  assert.equal(metricsFreshness(v, now("2026-11-02T11:00:00Z")).abandoned, false);
});

test("helper verdicts: savings rate vs 20%, crypto share, runway text", () => {
  assert.deepEqual(savingsVerdict(-12.5), { tag: "below target", gapPct: -32.5, target: 20 });
  assert.deepEqual(savingsVerdict(25, 20), { tag: "on target", gapPct: 5, target: 20 });
  assert.deepEqual(savingsVerdict(20, null), { tag: "on target", gapPct: 0, target: 20 });
  assert.deepEqual(savingsVerdict(null), { tag: "unknown", gapPct: null, target: 20 });
  assert.deepEqual(savingsVerdict(14, 15), { tag: "below target", gapPct: -1, target: 15 });
  assert.equal(sharePct(2000, 8000), 25);
  assert.equal(sharePct(1, 3), 33.3);
  assert.equal(sharePct(0, 8000), 0);
  assert.equal(sharePct(2000, 0), null);
  assert.equal(sharePct(null, 8000), null);
  const v = validateMetrics(fixture());
  assert.equal(runwayText(v.liquidity), "unknown (personal CAD cash / T12 average opex)");
  assert.equal(runwayText({ runway_months_personal: 7, runway_method: "" }), "7 months");
  assert.equal(runwayText({ runway_months_personal: 1, runway_method: "m" }), "1 month (m)");
  assert.equal(runwayText({ runway_months_personal: 2.25, runway_method: "" }), "2.3 months");
  assert.equal(runwayText(null), "unknown");
  assert.equal(entityCashText(v.liquidity.by_entity[0], (n) => n.toLocaleString("en-CA")), "CAD 100,000");
  assert.equal(entityCashText(v.liquidity.by_entity[2]), "unknown (balance missing for …1111, …4444)");
  assert.equal(entityCashText({ cash: null, currency: "CAD", missing_accounts: [] }), "unknown");
  // Debt figures are per entity; no helper adds personal and opco together.
  const groups = Object.fromEntries(debtsByEntity(v).map((g) => [g.entity, g]));
  assert.deepEqual(groups.personal, { entity: "personal", facilities: 2, balance_cad: 450000, balanceRows: 2, interest_month_cad: 1000, interestRows: 1, as_of: "2026-08" });
  assert.deepEqual(groups.opco, { entity: "opco", facilities: 1, balance_cad: 0, balanceRows: 1, interest_month_cad: 0, interestRows: 1, as_of: "2026-09-30" });
  assert.deepEqual(debtsByEntity(emptyMetrics()), []);
  // Funding derivation is the cash-model's: same tags, same days, same remaining.
  const funded = Object.fromEntries(metricsFundingRows(v, TODAY).map((f) => [f.id, f]));
  assert.equal(funded.rrsp.days, 133);
  assert.equal(funded.rrsp.tag, "unverified");
  assert.equal(funded.rrsp.remaining, null);
  assert.equal(funded.blocked.tag, "blocked");
});

test("needs you soon: overdue or imminent payables, blocked funding, open questions, ack after grace; sorted", () => {
  const v = validateMetrics(fixture());
  const rows = metricsPayableRows(v, TODAY);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.P01.tag, "overdue");
  assert.equal(by.P01.days, -2);
  assert.equal(by.P02.tag, "missing");
  assert.equal(by.P02.when, "next statement");
  assert.equal(by.R01.tag, "");
  assert.deepEqual(rows.map((r) => r.id), ["P01", "R01", "P02"]);
  assert.deepEqual(metricsContractStatus(v, TODAY), { missing: ["Agent B"], afterGrace: false, overdue: false });
  assert.deepEqual(metricsContractStatus(v, "2026-10-20"), { missing: ["Agent B"], afterGrace: true, overdue: true });
  const soon = needsYou(v, "2026-10-20");
  const kinds = soon.map((a) => `${a.kind}:${a.text}`);
  assert.ok(kinds.includes("payable:Example_PAYEE: CAD 321"));
  assert.ok(kinds.includes("funding blocked:Example blocked: blocked"));
  assert.ok(kinds.includes("ruling:3 open questions waiting for your answer (oldest 2026-09-20)"));
  assert.ok(kinds.includes("contract:Contract acknowledgement missing after grace: Agent B"));
  assert.ok(!kinds.some((k) => k.startsWith("receivable")), "a receivable due in December is not this week's item");
  assert.ok(!kinds.some((k) => k.includes("Example Card")), "a MISSING row is held, not due");
  assert.equal(soon[0].days, -3); // dated first
  // No blocks: nothing invented.
  assert.deepEqual(needsYou(emptyMetrics(), TODAY), []);
  // No helper sums across entities.
  for (const name of Object.keys(model)) assert.ok(!/total.*cash|cash.*total|sumEntities|allEntities|netWorthTotal/i.test(name), `${name} looks like a cross-entity sum`);
});
