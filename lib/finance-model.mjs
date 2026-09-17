// Pure, shared validation and arithmetic. Private records are runtime inputs only.
export const columns = {
  entities: ["id", "name", "kind", "parentId", "ownership", "notes"],
  assets: [
    "id",
    "entityId",
    "name",
    "category",
    "currency",
    "status",
    "propertyType",
    "included",
    "notes",
  ],
  valuations: ["assetId", "date", "gross", "debt", "source"],
  transactions: [
    "id",
    "entityId",
    "account",
    "institution",
    "date",
    "description",
    "amount",
    "currency",
    "category",
    "assetId",
    "reviewed",
    "documentUrl",
    "transferPairId",
  ],
  statements: [
    "id",
    "entityId",
    "institution",
    "account",
    "period",
    "currency",
    "opening",
    "closing",
    "source",
  ],
  updates: [
    "id",
    "assetId",
    "date",
    "title",
    "metric",
    "value",
    "unit",
    "note",
    "url",
  ],
  tasks: ["id", "entityId", "assetId", "title", "due", "status", "source"],
  documents: ["id", "entityId", "name", "category", "url", "period", "note"],
  events: ["id", "assetId", "date", "title", "note", "source"],
};
export const emptyFinance = () => ({
  schemaVersion: 1,
  entities: [],
  assets: [],
  valuations: [],
  transactions: [],
  statements: [],
  updates: [],
  tasks: [],
  documents: [],
  events: [],
});
const enums = {
  kind: ["holding", "personal", "operating", "other"],
  category: [
    "cash",
    "public",
    "angel",
    "fund",
    "property",
    "liability",
    "other",
  ],
  status: ["active", "dead", "exited"],
  propertyType: ["", "rental", "home"],
  included: ["yes", "no"],
};
const required = {
  entities: ["id", "name", "kind"],
  assets: [
    "id",
    "entityId",
    "name",
    "category",
    "currency",
    "status",
    "included",
  ],
  valuations: ["assetId", "date"],
  transactions: [
    "id",
    "entityId",
    "account",
    "institution",
    "date",
    "description",
    "amount",
    "currency",
    "category",
    "reviewed",
  ],
  statements: [
    "id",
    "entityId",
    "institution",
    "account",
    "period",
    "currency",
  ],
  updates: ["id", "assetId", "date", "title"],
  tasks: ["id", "entityId", "title", "status"],
  documents: ["id", "entityId", "name", "category", "url"],
  events: ["id", "assetId", "date", "title"],
};
const numeric = new Set([
  "ownership",
  "gross",
  "debt",
  "amount",
  "value",
  "opening",
  "closing",
]);
export function safeUrl(value) {
  if (!value) return "";
  try {
    const u = new URL(value);
    if (u.protocol === "https:" && !u.username && !u.password) return u.href;
  } catch {}
  throw Error("Links must be HTTPS without embedded credentials.");
}
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function number(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^-?\d+(\.\d{1,6})?$/.test(value))
  )
    throw Error(
      `${field} must be a plain number (no currency symbols or thousands separators).`,
    );
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12)
    throw Error(`${field} is outside the supported range.`);
  return n;
}
export function validateFinance(raw) {
  if (!raw || raw.schemaVersion !== 1)
    throw Error("Expected a version 1 finance workspace.");
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 2000000)
    throw Error(
      "Combined workspace exceeds 2 MB. Split it into smaller workspaces.",
    );
  const data = emptyFinance();
  for (const [kind, fields] of Object.entries(columns)) {
    const sourceRows =
      kind === "statements" && raw[kind] === undefined ? [] : raw[kind];
    if (!Array.isArray(sourceRows) || sourceRows.length > 10000)
      throw Error(`Invalid ${kind} table (maximum 10,000 rows).`);
    const ids = new Set();
    data[kind] = sourceRows.map((input, index) => {
      try {
        if (!input || typeof input !== "object") throw Error("Invalid row.");
        const row = {};
        for (const key of fields) {
          if (numeric.has(key)) row[key] = number(input[key], key);
          else {
            if (input[key] != null && typeof input[key] !== "string")
              throw Error(`${key} must be text.`);
            row[key] = (input[key] || "").trim();
            if (row[key].length > 3000) throw Error(`${key} is too long.`);
          }
        }
        for (const key of required[kind])
          if (row[key] === "" || row[key] === null)
            throw Error(`${key} is required.`);
        for (const key of [
          "id",
          "assetId",
          "entityId",
          "parentId",
          "transferPairId",
        ])
          if (row[key] && !/^[a-zA-Z0-9_-]{1,80}$/.test(row[key]))
            throw Error(
              `${key} must use letters, numbers, underscores or hyphens.`,
            );
        const key =
          kind === "valuations" ? `${row.assetId}:${row.date}` : row.id;
        if (ids.has(key)) throw Error("Duplicate row key.");
        ids.add(key);
        for (const key of ["date", "due"])
          if (row[key] && !validDate(row[key]))
            throw Error(`${key} must be a real YYYY-MM-DD date.`);
        for (const key of ["source", "url", "documentUrl"])
          if (row[key]) row[key] = safeUrl(row[key]);
        if (
          kind === "statements" &&
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)
        )
          throw Error("period must be YYYY-MM.");
        if (row.currency && !/^[A-Z]{3}$/.test(row.currency))
          throw Error("currency must be a three-letter uppercase code.");
        const allowed =
          kind === "entities"
            ? { kind: enums.kind }
            : kind === "assets"
              ? enums
              : kind === "transactions"
                ? {
                    category: [
                      "income",
                      "fee",
                      "expense",
                      "tax",
                      "transfer",
                      "principal",
                      "capital",
                      "other",
                    ],
                    reviewed: ["yes", "no"],
                  }
                : kind === "tasks"
                  ? { status: ["open", "done"] }
                  : {};
        for (const [key, values] of Object.entries(allowed))
          if (key in row && !values.includes(row[key]))
            throw Error(`${key}: use ${values.join(", ")}.`);
        if (kind === "valuations" && (row.gross < 0 || row.debt < 0))
          throw Error(
            "Gross value and debt must be non-negative; blank means unknown.",
          );
        if (
          kind === "entities" &&
          row.ownership !== null &&
          (row.ownership < 0 || row.ownership > 100)
        )
          throw Error("ownership must be between 0 and 100.");
        return row;
      } catch (e) {
        throw Error(`${kind}, row ${index + 1}: ${e.message}`);
      }
    });
  }
  const statementKeys = new Set();
  for (const row of data.statements) {
    const key = JSON.stringify([
      row.entityId,
      row.institution,
      row.account,
      row.currency,
      row.period,
    ]);
    if (statementKeys.has(key))
      throw Error(
        "Duplicate statement for the same entity, institution, account, currency and month.",
      );
    statementKeys.add(key);
  }
  const entities = new Map(data.entities.map((e) => [e.id, e])),
    assets = new Map(data.assets.map((a) => [a.id, a]));
  for (const [kind, rows] of Object.entries(data))
    if (Array.isArray(rows))
      for (const row of rows) {
        if (row.entityId && !entities.has(row.entityId))
          throw Error(
            `${kind}: entityId ${row.entityId} is not in Entities. Import entities first.`,
          );
        if (row.assetId && !assets.has(row.assetId))
          throw Error(
            `${kind}: assetId ${row.assetId} is not in Assets. Import assets first.`,
          );
        if (
          kind === "transactions" &&
          row.assetId &&
          (assets.get(row.assetId).entityId !== row.entityId ||
            assets.get(row.assetId).currency !== row.currency)
        )
          throw Error(
            "Transaction asset must have the same entity and currency.",
          );
        if (
          kind === "tasks" &&
          row.assetId &&
          assets.get(row.assetId).entityId !== row.entityId
        )
          throw Error("Task asset must have the same entity.");
      }
  for (const e of data.entities) {
    const seen = new Set([e.id]);
    let parent = e.parentId;
    while (parent) {
      if (!entities.has(parent) || seen.has(parent))
        throw Error("Entity parent is missing or hierarchy is cyclic.");
      seen.add(parent);
      parent = entities.get(parent).parentId;
    }
  }
  if (new TextEncoder().encode(JSON.stringify(data)).length > 2000000)
    throw Error(
      "Combined workspace exceeds 2 MB after normalization. Split it into smaller workspaces.",
    );
  return data;
}
export function readFinance(value) {
  if (!value) return { state: "unconfigured", snapshot: emptyFinance() };
  try {
    if (new TextEncoder().encode(value).length > 48000)
      throw Error("Too large");
    return { state: "ready", snapshot: validateFinance(JSON.parse(value)) };
  } catch {
    return { state: "invalid", snapshot: emptyFinance() };
  }
}
// RFC 4180 quoted fields, escaped quotes, BOM and CRLF; reject malformed input.
export function parseCsv(text) {
  if (new TextEncoder().encode(text).length > 2000000)
    throw Error("CSV exceeds 2 MB.");
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === undefined) throw Error("Unclosed quoted CSV field.");
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === '"') {
      if (field || closed) throw Error("Unexpected quote in CSV.");
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r" || c === undefined) {
      row.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
      continue;
    }
    if (closed) throw Error("Unexpected text after a quoted CSV field.");
    field += c;
  }
  if (rows.length < 2)
    throw Error("Include a header and at least one data row.");
  const headers = rows.shift().map((h) => h.trim());
  if (new Set(headers).size !== headers.length)
    throw Error("Duplicate CSV headers.");
  return {
    headers,
    rows: rows.map((r, i) => {
      if (r.length !== headers.length)
        throw Error(
          `CSV row ${i + 2} has ${r.length} fields; expected ${headers.length}.`,
        );
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    }),
  };
}
export function importCsv(data, kind, text) {
  if (!Object.hasOwn(columns, kind)) throw Error("Unknown table.");
  const { headers, rows } = parseCsv(text);
  for (const h of headers)
    if (!columns[kind].includes(h))
      throw Error(`Unknown column ${h}. Use the ${kind} template.`);
  for (const h of required[kind])
    if (!headers.includes(h)) throw Error(`Missing column ${h}.`);
  const key = (r) =>
    kind === "valuations"
      ? `${r.assetId?.trim()}:${r.date?.trim()}`
      : r.id?.trim();
  const incoming = new Set();
  for (const row of rows) {
    const id = key(row);
    if (incoming.has(id)) throw Error("Duplicate keys in import.");
    incoming.add(id);
  }
  const existing = new Map(data[kind].map((r) => [key(r), r]));
  const previous = new Map(existing);
  let replaced = 0;
  for (const row of rows) {
    if (existing.has(key(row))) replaced++;
    existing.set(key(row), row);
  }
  const snapshot = validateFinance({ ...data, [kind]: [...existing.values()] });
  const records = snapshot[kind].filter((r) => incoming.has(key(r)));
  const clearedFields = records.reduce((count, row) => {
    const before = previous.get(key(row));
    return (
      count +
      (before
        ? columns[kind].filter(
            (field) =>
              before[field] !== null &&
              before[field] !== undefined &&
              before[field] !== "" &&
              (row[field] === null || row[field] === ""),
          ).length
        : 0)
    );
  }, 0);
  return {
    snapshot,
    clearedFields,
    added: rows.length - replaced,
    replaced,
    rows: rows.length,
    records,
  };
}
export function csvExport(kind, rows) {
  const escape = (v) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [columns[kind], ...rows.map((r) => columns[kind].map((k) => r[k]))]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}
const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
export function assetRows(data, month, entity = "all", currency = "CAD") {
  const cutoff = `${month}-31`;
  return data.assets
    .filter(
      (a) =>
        (entity === "all" || a.entityId === entity) && a.currency === currency,
    )
    .map((a) => {
      const v = data.valuations
        .filter((v) => v.assetId === a.id && v.date <= cutoff)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      return {
        ...a,
        gross: v?.gross ?? null,
        debt: v?.debt ?? null,
        net:
          v?.gross != null && v?.debt != null ? sum([v.gross, -v.debt]) : null,
        date: v?.date || "",
        source: v?.source || "",
        carried: !!v && !v.date.startsWith(month),
      };
    });
}
export function totals(rows) {
  const included = rows.filter((a) => a.included === "yes");
  return {
    count: included.length,
    known: included.filter((a) => a.net !== null).length,
    gross: included.some((a) => a.gross !== null)
      ? sum(included.filter((a) => a.gross !== null).map((a) => a.gross))
      : null,
    debt: included.some((a) => a.debt !== null)
      ? sum(included.filter((a) => a.debt !== null).map((a) => a.debt))
      : null,
    net:
      included.length && included.every((a) => a.net !== null)
        ? sum(included.map((a) => a.net))
        : null,
  };
}
export function monthsThrough(month) {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(y, m - 12 + i, 1)).toISOString().slice(0, 7),
  );
}
export function propertyPnl(transactions, assetId, month, currency) {
  return monthsThrough(month).map((period) => {
    const rows = transactions.filter(
      (t) =>
        t.assetId === assetId &&
        t.currency === currency &&
        t.date.startsWith(period),
    );
    const operating = rows.filter((t) =>
      ["income", "fee", "expense", "tax"].includes(t.category),
    );
    return {
      period,
      rows: rows.length,
      income: rows.length
        ? sum(
            operating
              .filter((t) => t.category === "income")
              .map((t) => t.amount),
          )
        : null,
      costs: rows.length
        ? -sum(
            operating
              .filter((t) => t.category !== "income")
              .map((t) => t.amount),
          )
        : null,
      net: rows.length ? sum(operating.map((t) => t.amount)) : null,
      excluded: sum(
        rows
          .filter(
            (t) => !["income", "fee", "expense", "tax"].includes(t.category),
          )
          .map((t) => t.amount),
      ),
    };
  });
}
export function transferWarnings(transactions) {
  const groups = new Map();
  for (const t of transactions.filter((t) => t.category === "transfer")) {
    const key = t.transferPairId || `unpaired:${t.id}`;
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  return [...groups.values()].filter(
    (rows) =>
      rows.length !== 2 ||
      rows[0].currency !== rows[1].currency ||
      sum(rows.map((t) => t.amount)) !== 0 ||
      (rows[0].account === rows[1].account &&
        rows[0].institution === rows[1].institution &&
        rows[0].entityId === rows[1].entityId),
  ).length;
}

export function transactionSummary(rows) {
  return {
    inflows: rows.length
      ? sum(rows.filter((t) => t.amount > 0).map((t) => t.amount))
      : null,
    outflows: rows.length
      ? -sum(rows.filter((t) => t.amount < 0).map((t) => t.amount))
      : null,
    net: rows.length ? sum(rows.map((t) => t.amount)) : null,
  };
}
export function reconcileStatements(
  data,
  month,
  entity = "all",
  currency = "CAD",
) {
  return data.statements
    .filter(
      (s) =>
        s.period === month &&
        s.currency === currency &&
        (entity === "all" || s.entityId === entity),
    )
    .map((s) => {
      const rows = data.transactions.filter(
        (t) =>
          t.entityId === s.entityId &&
          t.institution === s.institution &&
          t.account === s.account &&
          t.currency === s.currency &&
          t.date.startsWith(s.period),
      );
      const movement = sum(rows.map((t) => t.amount)),
        expected = s.opening === null ? null : sum([s.opening, movement]);
      const difference =
        expected === null || s.closing === null
          ? null
          : sum([s.closing, -expected]);
      return {
        ...s,
        rows: rows.length,
        movement,
        expected,
        difference,
        status:
          difference === null
            ? "Missing balance"
            : !rows.length
              ? "No imported activity"
              : difference === 0
                ? "Balanced"
                : "Difference",
      };
    });
}
