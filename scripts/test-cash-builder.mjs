// Builder behaviour against a temporary, fictional MONEYOS_DIR. No private file is read.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const BUILDER = new URL("./build-cash-snapshot.mjs", import.meta.url).pathname;

const base = () => ({
  "data/cfo-feed/facts.json": JSON.stringify({ updated: "2026-10-01", entities: {}, tax_items: [] }),
  "data/savings-rate.csv": [
    "month,income,opex,savings_rate,status",
    "2026-09,1000,900,0.1,provisional",
    "2026-07,1000,1200,-0.2,final",
    "T12_2025-10_2026-09,12000,12600,-0.05,provisional",
    "2026-08,1000,1100,-0.1,final",
  ].join("\n"),
  "data/tieout.csv": [
    "file,account,last4,stmt_date,diff,note,status",
    "a.pdf,Example chequing,1111,2026-09-30,0.0,ties nicely,ties",
    "b.pdf,Example card,2222,2026-10-15,0.0,package section,ties",
    "c.pdf,Example line,3333,2026-10-01,12.5,ties? no,does not tie",
    "d.pdf,Example new,4444,2026-10-20,,no statement yet,",
  ].join("\n"),
  "books/trial-balance.csv": [
    "code,account,debit,credit,balance",
    "1030,Example bank,10.0,0.0,10.0",
    "1900,Suspense - unmatched transfer,5.0,15.0,-10.0",
    ",TOTAL,15.0,15.0,1.2e-11",
  ].join("\n"),
  "data/payables-receivables.csv": [
    "id,priority,type,entity,counterparty,description,amount,currency,due_date,status,source,last_checked",
    "P01,2,payable,personal,Example Utility,Example bill 1234567,100,CAD,2026-10-30,open,stmt,2026-10-19",
    "P02,1,payable,personal,Example Tax,Example balance,200,CAD,overdue,open,letter,2026-10-19",
    "P03,3,payable,personal,Example Paid,Example settled,50,CAD,2026-09-01,paid 2026-09-02,stmt,2026-10-19",
  ].join("\n"),
  "clarify/to-clarify.csv": [
    "Date,Last 4,Description,Status,Batch ID",
    "2026-10-28,1111,Example resolved later,resolved,B1",
    "2026-10-20,1111,Example open,open,B1",
    "2026-10-18,2222,Example open too,open,B2",
  ].join("\n"),
  "clarify/open-questions.csv": ["Id,Asked,Status", "Q01,2026-10-01,open", "Q02,2026-10-02,resolved"].join("\n"),
  "data/cabin-statements.csv": [
    "statement_month,nights,gross_income,sales_taxes_collected,statement_total,net_ex_tax",
    "2026-09,11,2500,200,1200,950",
    "2026-08,9,2000,150,1000,800",
  ].join("\n"),
  "sources.json": JSON.stringify({ contract_version: "2.0.0", contract_date: "2026-10-12", ack_grace_days: 7, required_acks: ["Agent A", "Agent B"], next_question_id: 3 }),
  "SOURCE_OF_TRUTH.md": "# contract\n",
  "ACK.md": "| agent | date | contract_hash | note |\n|---|---|---|---|\n| Agent A | 2026-10-12 | placeholder | ok |\n",
});

function run(files, { context } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "moneyos-fixture-"));
  const ctx = context ?? mkdtempSync(join(tmpdir(), "context-fixture-"));
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  const r = spawnSync(process.execPath, [BUILDER], { env: { ...process.env, MONEYOS_DIR: dir, CONTEXT_DIR: ctx }, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  if (!context) rmSync(ctx, { recursive: true, force: true });
  return { status: r.status, stderr: r.stderr, snapshot: r.status === 0 ? JSON.parse(r.stdout) : null };
}

test("builder fails closed on a missing directory or a missing facts.json", () => {
  const r = spawnSync(process.execPath, [BUILDER], { env: { ...process.env, MONEYOS_DIR: join(tmpdir(), "does-not-exist-moneyos") }, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is not a directory/);
  const files = base();
  files["data/cfo-feed/facts.json"] = null;
  const r2 = run(files);
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /data\/cfo-feed\/facts\.json/);
});

test("builder: full fictional record builds, masks digits, and state.json is optional", () => {
  const { status, snapshot: s, stderr } = run(base());
  assert.equal(status, 0, stderr);
  assert.equal(s.feed.lastPostDate, null); // no state.json in CONTEXT_DIR
  assert.equal(s.payables.find((p) => p.id === "P01").description, "Example bill ...4567");
  assert.equal(s.cabin.lastStatementMonth, "2026-09");
  assert.equal(s.cabin.statementsOnFile, 2);
  assert.equal(s.books.suspenseCad, -10);
  assert.equal(s.books.balanced, true);
  assert.equal(s.contract.version, "2.0.0");
  assert.match(s.contract.hash, /^[0-9a-f]{12}$/);
  assert.deepEqual(s.contract.ackedAgents, []); // placeholder hash does not match
  assert.equal(s.contract.graceUntil, "2026-10-19");
});

test("builder: savings rate takes the newest month by value, and scorecard.asOf falls back to its month end", () => {
  const { snapshot: s } = run(base());
  assert.equal(s.scorecard.savingsRate.month, "2026-09");
  assert.equal(s.scorecard.savingsRate.monthRatePct, 10);
  assert.equal(s.scorecard.savingsRate.asOf, "2026-09-30");
  assert.equal(s.scorecard.savingsRate.t12Label, "T12 2025-10 to 2026-09");
  assert.equal(s.scorecard.savingsRate.t12RatePct, -5);
  // No scorecard.json: the scorecard's as-of is the savings-rate month end, not null.
  assert.equal(s.scorecard.asOf, "2026-09-30");
  const files = base();
  files["data/cfo-feed/scorecard.json"] = JSON.stringify({ as_of: "2026-10-18" });
  assert.equal(run(files).snapshot.scorecard.asOf, "2026-10-18");
  // Neither file: no scorecard section at all (nothing to go stale).
  const none = base();
  none["data/savings-rate.csv"] = null;
  assert.equal(run(none).snapshot.scorecard, null);
});

test("builder: tie-outs count the status column only", () => {
  const { snapshot: s } = run(base());
  // "ties" inside a note cell and "ties? no" in a note never count; the blank status is "other".
  assert.equal(s.books.tieOutsPassing, 2);
  assert.equal(s.books.tieOutsFailing, 1);
  assert.equal(s.books.tieOutsOther, 1);
  assert.equal(s.books.asOf, "2026-10-20");
});

test("builder: a record file that does not parse fails the build and is named", () => {
  const files = base();
  files["data/tieout.csv"] = 'file,status\n"unclosed,ties\n';
  const r = run(files);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /data\/tieout\.csv does not parse/);
});

test("builder: a malformed ack_grace_days leaves the grace date unknown without throwing", () => {
  for (const bad of ['"seven"', "-1", "2.5", "null"]) {
    const files = base();
    files["sources.json"] = `{"contract_version":"2.0.0","contract_date":"2026-10-12","ack_grace_days":${bad},"required_acks":["Agent A"],"next_question_id":3}`;
    const r = run(files);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.snapshot.contract.graceUntil, bad === "null" ? "2026-10-19" : null, `ack_grace_days ${bad}`);
  }
});

test("builder: payables are ordered overdue first then priority before the 30-row cap, and dropped ids are reported", () => {
  const header = "id,priority,type,entity,counterparty,description,amount,currency,due_date,status,source,last_checked";
  const rows = [header];
  for (let i = 1; i <= 33; i++) rows.push(`P${String(i).padStart(2, "0")},${40 - i},payable,personal,Example ${i},Example,${i},CAD,2099-01-01,open,stmt,2026-10-19`);
  // The last two rows are the urgent ones: priority 1 and an overdue free-text date.
  rows.push("P34,1,payable,personal,Example Priority,Example,1,CAD,2099-01-01,open,stmt,2026-10-19");
  rows.push("P35,30,payable,personal,Example Overdue,Example,1,CAD,overdue,open,stmt,2026-10-19");
  const files = base();
  files["data/payables-receivables.csv"] = rows.join("\n");
  const { status, snapshot: s, stderr } = run(files);
  assert.equal(status, 0, stderr);
  assert.equal(s.payables.length, 30);
  assert.deepEqual(s.payables.slice(0, 2).map((p) => p.id), ["P35", "P34"]);
  // The five lowest-priority rows (priority 35..39) are dropped, listed in sorted order.
  assert.match(stderr, /payables capped at 30; dropped 5 row\(s\): P05, P04, P03, P02, P01/);
});

test("builder: clarify as-of is the newest OPEN row and counts come from the Status column", () => {
  const { snapshot: s } = run(base());
  assert.equal(s.clarify.openToClarifyRows, 2);
  assert.equal(s.clarify.batches, 2);
  assert.equal(s.clarify.openQuestions, 1);
  assert.equal(s.clarify.asOf, "2026-10-20"); // not the 2026-10-28 resolved row
});
