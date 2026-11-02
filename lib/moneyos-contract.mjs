// The MoneyOS contract hash, computed exactly as scripts/check_sot.py does in the
// private MoneyOS repository: sha256 of SOURCE_OF_TRUTH.md bytes followed by Python's
// json.dumps(sources minus next_question_id, sort_keys=True, ensure_ascii=False),
// first 12 hex characters. Node-only (crypto); no private data lives here.
import { createHash } from "node:crypto";

const PY_ESCAPES = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f" };

// Python json.dumps with default separators (", ", ": "), sort_keys=True, ensure_ascii=False.
export function pyJson(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    throw Error("pyJson: non-integer numbers are not reproduced byte for byte.");
  }
  if (typeof value === "string")
    return `"${value.replace(/[\u0000-\u001f\\"]/g, (c) => PY_ESCAPES[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
  if (Array.isArray(value)) return `[${value.map(pyJson).join(", ")}]`;
  if (typeof value !== "object") throw Error(`pyJson: unsupported value ${typeof value}.`);
  // Python sorts keys by code point; JS default sort compares UTF-16 code units, equal for BMP keys.
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${pyJson(k)}: ${pyJson(value[k])}`)
    .join(", ")}}`;
}

export function contractHash(sotBytes, sourcesText) {
  const d = JSON.parse(sourcesText);
  delete d.next_question_id;
  return createHash("sha256").update(sotBytes).update(Buffer.from(pyJson(d), "utf8")).digest("hex").slice(0, 12);
}

// ACK.md table rows: agent | date | contract_hash | note. Returns the agents whose
// row names the given hash (any row, newest first or not).
export function ackedAgents(ackMarkdown, hash) {
  const acked = new Set();
  if (!hash) return [];
  for (const line of String(ackMarkdown ?? "").split("\n")) {
    if (!line.startsWith("|") || /^\|\s*(agent|-+)\s*\|/i.test(line)) continue;
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length >= 3 && cells[2] === hash) acked.add(cells[0]);
  }
  return [...acked];
}
