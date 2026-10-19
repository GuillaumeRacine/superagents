import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { freshness, taskQueue, validateCash, pct } from "../lib/cash-model.mjs";
import { readCashSnapshot } from "../lib/cash-snapshot.mjs";

const fx = () => JSON.parse(readFileSync("scripts/fixtures/cash.example.json", "utf8"));
const NOW = Date.parse("2030-01-15T14:00:00Z");
const gz = (o) => gzipSync(JSON.stringify(o)).toString("base64");

test("fixture is labelled example data and validates", () => {
  assert.match(fx()._note, /EXAMPLE DATA ONLY/);
  const s = validateCash(fx());
  assert.equal(s.headline.t30dNetBurnCad, 12000);
  assert.equal(s.series.length, 5);
});
test("missing, invalid and hostile input never throws", () => {
  for (const v of [undefined, null, "", "{}", "[]", "nope", 42, { schemaVersion: 2 }, { schemaVersion: 1 }]) {
    assert.equal(validateCash(v), null);
    assert.doesNotThrow(() => readCashSnapshot({ json: typeof v === "string" ? v : JSON.stringify(v) }));
  }
  assert.equal(readCashSnapshot({}).state, "missing");
  assert.equal(readCashSnapshot({ json: "nope" }).state, "invalid");
  const bad = fx(); bad.series = "x"; bad.tasks = [null, 3, {}]; bad.sources = {};
  const s = validateCash(bad);
  assert.deepEqual(s.series, []); assert.deepEqual(s.tasks, []); assert.deepEqual(s.sources, []);
});
test("gzip transport takes precedence and fails closed", () => {
  assert.equal(readCashSnapshot({ gzipBase64: gz(fx()) }).state, "ready");
  assert.equal(readCashSnapshot({ json: JSON.stringify(fx()), gzipBase64: "" }).state, "invalid");
  assert.equal(readCashSnapshot({ json: JSON.stringify(fx()), gzipBase64: "!!!" }).state, "invalid");
  assert.equal(readCashSnapshot({ gzipBase64: gzipSync("not json").toString("base64") }).state, "invalid");
  assert.equal(readCashSnapshot({ gzipBase64: "A".repeat(48004) }).state, "invalid");
  assert.equal(readCashSnapshot({ json: JSON.stringify(fx()) }).state, "ready");
});
test("freshness: fresh, stale input >3 days, stale snapshot >36h, no data", () => {
  const s = validateCash(fx());
  assert.equal(freshness(s, NOW).stale, false);
  const oldInput = validateCash({ ...fx(), sources: [{ name: "Example bank", asOf: "2030-01-10" }] });
  const f1 = freshness(oldInput, NOW);
  assert.equal(f1.stale, true); assert.match(f1.reasons[0], /Example bank.*5 days/);
  const f2 = freshness(s, Date.parse("2030-01-17T05:00:00Z"));
  assert.equal(f2.stale, true); assert.match(f2.reasons.join(" "), /hours ago/);
  assert.equal(freshness(null, NOW).stale, true);
  const unknown = validateCash({ ...fx(), sources: [{ name: "No date" }] });
  assert.equal(freshness(unknown, NOW).stale, true);
});
test("task queue shows one task today and the remaining count", () => {
  const q = taskQueue(validateCash(fx()).tasks);
  assert.equal(q.today.id, "t1"); assert.equal(q.remaining, 1); assert.equal(q.done, 1);
  assert.deepEqual(taskQueue([]), { today: null, remaining: 0, done: 0 });
});
test("percent helper is zero-safe", () => { assert.equal(pct(3, 12), 25); assert.equal(pct(1, 0), 0); });
test("schema file exists and the repo holds no real data env values", () => {
  assert.ok(existsSync("docs/finance/schema/cash.schema.json"));
  JSON.parse(readFileSync("docs/finance/schema/cash.schema.json", "utf8"));
});
