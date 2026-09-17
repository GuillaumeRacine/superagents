import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  emptyFinance,
  readFinance,
  validateFinance,
} from "../lib/finance-model.mjs";
import { readFinanceSnapshot } from "../lib/finance-snapshot.mjs";

const encode = (text) => gzipSync(text).toString("base64");
const fixture = () => ({
  ...emptyFinance(),
  entities: [{ id: "example", name: "Example Holdings", kind: "holding" }],
});
const invalid = (gzipBase64) => {
  const result = readFinanceSnapshot({
    json: JSON.stringify(fixture()),
    gzipBase64,
  });
  assert.deepEqual(result, { state: "invalid", snapshot: emptyFinance() });
};

test("JSON transport preserves existing ready, missing and invalid behavior", () => {
  for (const json of [
    undefined,
    "",
    "{}",
    "not JSON",
    JSON.stringify(fixture()),
    " ".repeat(48001),
  ])
    assert.deepEqual(readFinanceSnapshot({ json }), readFinance(json));
});

test("compressed transport round trips a history larger than the JSON limit", () => {
  const raw = fixture();
  raw.documents = Array.from({ length: 400 }, (_, i) => ({
    id: `example-${i}`,
    entityId: "example",
    name: `Example report ${i}`,
    category: "Financial statement",
    url: `https://example.com/reports/${i}`,
    note: "Fictional source record for historical reporting.",
  }));
  const json = JSON.stringify(raw);
  assert.ok(Buffer.byteLength(json) > 48000);
  const gzipBase64 = encode(json);
  assert.ok(Buffer.byteLength(gzipBase64) < 48000);
  assert.equal(readFinance(json).state, "invalid");
  assert.deepEqual(readFinanceSnapshot({ gzipBase64 }), {
    state: "ready",
    snapshot: validateFinance(raw),
  });
});

test("compressed transport takes precedence over JSON", () => {
  const raw = fixture();
  raw.entities[0].name = "Example Compressed Holdings";
  assert.deepEqual(
    readFinanceSnapshot({
      json: JSON.stringify(fixture()),
      gzipBase64: encode(JSON.stringify(raw)),
    }).snapshot,
    validateFinance(raw),
  );
});

test("invalid present compressed values never fall back to valid JSON", () => {
  for (const value of [
    "",
    null,
    4,
    "%%%%",
    "YQ",
    "YQ===",
    "YQ==\n",
    "YR==",
    "_AAA",
    "éAAA",
  ])
    invalid(value);
  const valid = encode(JSON.stringify(fixture()));
  invalid(`${valid}\n`);
  invalid(`${valid} `);
  invalid("A".repeat(48004));
});

test("invalid gzip, damaged streams, invalid JSON and UTF-8 fail closed", () => {
  invalid(Buffer.from("not gzip").toString("base64"));
  const compressed = gzipSync(JSON.stringify(fixture()));
  invalid(compressed.subarray(0, compressed.length - 1).toString("base64"));
  const damaged = Buffer.from(compressed);
  damaged[damaged.length - 8] ^= 1;
  invalid(damaged.toString("base64"));
  invalid(encode("not JSON"));
  invalid(encode(Buffer.from([0xff, 0xfe])));
});

test("decoded byte limit is enforced during decompression, including concatenated members", () => {
  const json = JSON.stringify(fixture());
  const atLimit = json.padEnd(2000000, " ");
  assert.equal(
    readFinanceSnapshot({ gzipBase64: encode(atLimit) }).state,
    "ready",
  );
  invalid(encode(`${atLimit} `));
  invalid(encode(" ".repeat(8000000)));
  invalid(Buffer.concat([gzipSync(atLimit), gzipSync(" ")]).toString("base64"));
});

test("decoded schema, cross-reference, and normalized-size validation still apply", () => {
  invalid(encode("{}"));
  const badReference = fixture();
  badReference.documents = [
    {
      id: "bad",
      entityId: "missing",
      name: "Example",
      url: "https://example.com",
    },
  ];
  invalid(encode(JSON.stringify(badReference)));
  const oversized = fixture();
  oversized.documents = Array.from({ length: 10001 }, (_, i) => ({
    id: `row-${i}`,
  }));
  invalid(encode(JSON.stringify(oversized)));
  const expanded = fixture();
  expanded.assets = [
    {
      id: "example-asset",
      entityId: "example",
      name: "Example Investment",
      category: "angel",
      currency: "CAD",
      status: "active",
      included: "yes",
    },
  ];
  expanded.updates = Array.from({ length: 10000 }, (_, i) => ({
    id: `u${i}`,
    assetId: "example-asset",
    date: "2026-09-01",
    title: "x".repeat(100),
  }));
  assert.ok(Buffer.byteLength(JSON.stringify(expanded)) < 2000000);
  assert.throws(() => validateFinance(expanded), /after normalization/);
  invalid(encode(JSON.stringify(expanded)));
});
