// Pure validation and derivations for the live core-metrics record
// (moneyos_metrics_v1, written by the private MoneyOS repository on every refresh
// and read by /dashboard/cash at request time; issue #61).
// Rules, as in cash-model: null means unknown and is never coerced to 0; every
// block carries its own as-of; entities are never summed by this module (a
// cross-entity figure arrives labelled sheet_total and is shown as such); text
// is bounded and masked again here (any run of five or more digits keeps its
// last four); the site derives, it does not invent.
import { daysBetween, fundingRows, payableRows, round2, validDate, validMonth } from "./cash-model.mjs";

export const SCHEMA = "moneyos_metrics_v1";
export const MAX_JSON_BYTES = 200000;
export const CAPS = {
  freshness: 60,
  pnl_monthly: 14,
  income_by_source_t12: 20,
  spend_rows: 40,
  interest_by_month: 14,
  interest_accounts: 30,
  debts: 30,
  payables: 40,
  series: 400,
  entities: 20,
  funding: 20,
  agents: 20,
  sources: 40,
};
export const SAVINGS_TARGET_PCT = 20;
const MAX_TEXT = 400;

// Account masking, re-applied on read: the record is trusted to mask, the page
// never relies on it. "...1234" is the builder's convention.
export const mask = (s) => String(s ?? "").replace(/\d{5,}/g, (m) => `...${m.slice(-4)}`);

export const emptyMetrics = () => ({
  schema: SCHEMA,
  generated_at: null,
  // Provenance: content hash of the inputs (shown as the id), the head the file was
  // built from (informational), and the commit the file claims (optional).
  inputs_hash: null,
  built_from_head: null,
  moneyos_sha: null,
  verdicts_as_of: null,
  ledger_through: null,
  freshness: [],
  north_star: { savings_rate: null },
  burn: null,
  pnl_monthly: [],
  income_by_source_t12: [],
  spend_by_line: null,
  interest_by_month: [],
  debts: null,
  liquidity: null,
  net_worth: null,
  funding: null,
  payables: [],
  cabin: null,
  books: null,
  open_items: null,
  contract: null,
  sources: [],
});

// ---- field helpers (same strictness as cash-model) ----
const blank = (v) => v === null || v === undefined || v === "";
function date(value, field, { month = false } = {}) {
  if (blank(value)) return null;
  if (validDate(value) || (month && validMonth(value))) return value;
  throw Error(`${field} must be an ISO date${month ? " or month" : ""}.`);
}
function dateTime(value, field) {
  if (blank(value)) return null;
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))
    throw Error(`${field} must be an ISO date-time.`);
  return value;
}
function number(value, field) {
  if (blank(value)) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw Error(`${field} must be a finite number or null.`);
  if (Math.abs(value) > 1e12) throw Error(`${field} is outside the range.`);
  return value;
}
function count(value, field) {
  const n = number(value, field);
  if (n !== null && (!Number.isInteger(n) || n < 0)) throw Error(`${field} must be a whole number.`);
  return n;
}
function bool(value, field) {
  if (blank(value)) return null;
  if (typeof value !== "boolean") throw Error(`${field} must be true, false or null.`);
  return value;
}
function text(value, field, max = MAX_TEXT) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw Error(`${field} must be text.`);
  if (value.length > max) throw Error(`${field} is longer than ${max}.`);
  return mask(value).trim();
}
function oneOf(value, field, allowed) {
  if (blank(value)) return null;
  if (!allowed.includes(value)) throw Error(`${field} must be one of ${allowed.join(", ")}.`);
  return value;
}
function currency(value, field, fallback = "CAD") {
  if (blank(value)) return fallback;
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw Error(`${field} must be a three-letter currency code.`);
  return value;
}
function list(value, field, cap) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`${field} must be a list.`);
  if (value.length > cap) throw Error(`${field} exceeds ${cap} rows.`);
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw Error(`${field} rows must be objects.`);
    return row;
  });
}
function object(value, field) {
  if (typeof value !== "object" || Array.isArray(value) || value === null) throw Error(`${field} must be an object.`);
  return value;
}
// An optional block: null or absent means "not in this file", shown as unknown.
const optional = (value, field, fn) => (value === null || value === undefined ? null : fn(object(value, field)));
function series(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`${field} must be a list.`);
  if (value.length > CAPS.series) throw Error(`${field} exceeds ${CAPS.series} points.`);
  return value
    .map((p) => {
      if (!Array.isArray(p) || p.length !== 2) throw Error(`${field} rows must be [date, amount].`);
      return [date(p[0], `${field}.date`), number(p[1], `${field}.amount`)];
    })
    .filter(([d, v]) => d && v !== null)
    .sort((a, b) => a[0].localeCompare(b[0]));
}
function unique(rows, field, key = "id") {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row[key])) throw Error(`Duplicate ${field} ${key} ${row[key]}.`);
    seen.add(row[key]);
  }
}

// ---- blocks ----
function savingsRate(r) {
  const f = "north_star.savings_rate";
  return {
    month: date(r.month, `${f}.month`, { month: true }),
    rate_pct: number(r.rate_pct, `${f}.rate_pct`),
    income_cad: number(r.income_cad, `${f}.income_cad`),
    crypto_cad: number(r.crypto_cad, `${f}.crypto_cad`),
    earned_income_ex_crypto_cad: number(r.earned_income_ex_crypto_cad, `${f}.earned_income_ex_crypto_cad`),
    opex_cad: number(r.opex_cad, `${f}.opex_cad`),
    interest_cad: number(r.interest_cad, `${f}.interest_cad`),
    principal_cad: number(r.principal_cad, `${f}.principal_cad`),
    status: oneOf(r.status, `${f}.status`, ["provisional", "final"]),
    t12_label: text(r.t12_label, `${f}.t12_label`, 80),
    t12_rate_pct: number(r.t12_rate_pct, `${f}.t12_rate_pct`),
    t12_income_cad: number(r.t12_income_cad, `${f}.t12_income_cad`),
    t12_opex_cad: number(r.t12_opex_cad, `${f}.t12_opex_cad`),
    definition: text(r.definition, `${f}.definition`),
    target_pct: number(r.target_pct, `${f}.target_pct`),
    as_of: date(r.as_of, `${f}.as_of`),
  };
}
function burn(b) {
  return {
    t30d_net_burn_cad: number(b.t30d_net_burn_cad, "burn.t30d_net_burn_cad"),
    as_of: date(b.as_of, "burn.as_of"),
    vs_30d_ago_cad: number(b.vs_30d_ago_cad, "burn.vs_30d_ago_cad"),
    scope: text(b.scope, "burn.scope", 120),
    method: text(b.method, "burn.method"),
    series: series(b.series, "burn.series"),
  };
}
function pnlRow(r, i) {
  const f = `pnl_monthly[${i}]`;
  return {
    month: date(r.month, `${f}.month`, { month: true }),
    income_cad: number(r.income_cad, `${f}.income_cad`),
    crypto_cad: number(r.crypto_cad, `${f}.crypto_cad`),
    owner_flows_in_cad: number(r.owner_flows_in_cad, `${f}.owner_flows_in_cad`),
    opex_cad: number(r.opex_cad, `${f}.opex_cad`),
    interest_cad: number(r.interest_cad, `${f}.interest_cad`),
    principal_cad: number(r.principal_cad, `${f}.principal_cad`),
    net_cad: number(r.net_cad, `${f}.net_cad`),
    status: oneOf(r.status, `${f}.status`, ["provisional", "final"]),
  };
}
function spend(s) {
  return {
    month: date(s.month, "spend_by_line.month", { month: true }),
    rows: list(s.rows, "spend_by_line.rows", CAPS.spend_rows).map((r, i) => ({
      line: text(r.line, `spend_by_line.rows[${i}].line`, 120),
      month_cad: number(r.month_cad, `spend_by_line.rows[${i}].month_cad`),
      t12_cad: number(r.t12_cad, `spend_by_line.rows[${i}].t12_cad`),
      t12_avg_cad: number(r.t12_avg_cad, `spend_by_line.rows[${i}].t12_avg_cad`),
    })),
    month_total_cad: number(s.month_total_cad, "spend_by_line.month_total_cad"),
    t12_total_cad: number(s.t12_total_cad, "spend_by_line.t12_total_cad"),
  };
}
// The normalized pair form of a map: every row must be [key, value].
function pairs(value, field) {
  return value.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) throw Error(`${field}[${i}] must be a [key, value] pair.`);
    return p;
  });
}
function interestRow(r, i) {
  const f = `interest_by_month[${i}]`;
  // The file carries {last4: CAD}; the normalized form is sorted pairs, which round-trip.
  const entries = Array.isArray(r.by_account)
    ? pairs(r.by_account, `${f}.by_account`)
    : Object.entries(r.by_account === undefined || r.by_account === null ? {} : object(r.by_account, `${f}.by_account`));
  if (entries.length > CAPS.interest_accounts) throw Error(`${f}.by_account exceeds ${CAPS.interest_accounts} accounts.`);
  return {
    month: date(r.month, `${f}.month`, { month: true }),
    total_cad: number(r.total_cad, `${f}.total_cad`),
    // Normalized to sorted [last4, CAD] pairs so the key is masked like any text.
    by_account: entries
      .map(([k, v]) => [text(k, `${f}.by_account.key`, 40), number(v, `${f}.by_account.value`)])
      .sort((a, b) => a[0].localeCompare(b[0])),
  };
}
function debts(d) {
  const rows = list(d.rows, "debts.rows", CAPS.debts).map((r, i) => {
    const f = `debts.rows[${i}]`;
    return {
      id: text(r.id, `${f}.id`, 32) || `debt-${i + 1}`,
      name: text(r.name, `${f}.name`, 120),
      kind: text(r.kind, `${f}.kind`, 40),
      entity: text(r.entity, `${f}.entity`, 40),
      balance_cad: number(r.balance_cad, `${f}.balance_cad`),
      as_of: date(r.as_of, `${f}.as_of`, { month: true }),
      rate_pct: number(r.rate_pct, `${f}.rate_pct`),
      interest_month_cad: number(r.interest_month_cad, `${f}.interest_month_cad`),
    };
  });
  unique(rows, "debt");
  return {
    rows,
    total_cad: number(d.total_cad, "debts.total_cad"),
    as_of: date(d.as_of, "debts.as_of"),
    facilities: count(d.facilities, "debts.facilities"),
  };
}
function liquidity(l) {
  return {
    by_entity: list(l.by_entity, "liquidity.by_entity", CAPS.entities).map((e, i) => {
      const f = `liquidity.by_entity[${i}]`;
      return {
        entity: text(e.entity, `${f}.entity`, 40),
        currency: currency(e.currency, `${f}.currency`),
        cash: number(e.cash, `${f}.cash`),
        as_of: date(e.as_of, `${f}.as_of`),
        source: text(e.source, `${f}.source`, 120),
        // In-ledger accounts with no balance on file; cash stays null while any is listed.
        missing_accounts: last4List(e.missing_accounts, `${f}.missing_accounts`),
      };
    }),
    unused_credit_cad: number(l.unused_credit_cad, "liquidity.unused_credit_cad"),
    payables_next_60d_cad: number(l.payables_next_60d_cad, "liquidity.payables_next_60d_cad"),
    runway_months_personal: number(l.runway_months_personal, "liquidity.runway_months_personal"),
    runway_method: text(l.runway_method, "liquidity.runway_method"),
  };
}
function netWorth(n) {
  return {
    by_entity: list(n.by_entity, "net_worth.by_entity", CAPS.entities).map((e, i) => {
      const f = `net_worth.by_entity[${i}]`;
      return {
        entity: text(e.entity, `${f}.entity`, 40),
        assets_cad: number(e.assets_cad, `${f}.assets_cad`),
        debts_cad: number(e.debts_cad, `${f}.debts_cad`),
        net_cad: number(e.net_cad, `${f}.net_cad`),
        as_of: date(e.as_of, `${f}.as_of`),
        confidence: oneOf(e.confidence, `${f}.confidence`, ["low", "medium", "high"]),
        source: text(e.source, `${f}.source`, 160),
      };
    }),
    sheet_total_cad: number(n.sheet_total_cad, "net_worth.sheet_total_cad"),
    sheet_total_as_of: date(n.sheet_total_as_of, "net_worth.sheet_total_as_of"),
    note: text(n.note, "net_worth.note"),
  };
}
function funding(fu) {
  const targets = list(fu.targets, "funding.targets", CAPS.funding).map((t, i) => {
    const f = `funding.targets[${i}]`;
    return {
      id: text(t.id, `${f}.id`, 32) || `target-${i + 1}`,
      label: text(t.label, `${f}.label`, 120),
      target_cad: number(t.target_cad, `${f}.target_cad`),
      contributed_cad: number(t.contributed_cad, `${f}.contributed_cad`),
      contributed_as_of: date(t.contributed_as_of, `${f}.contributed_as_of`),
      deadline: date(t.deadline, `${f}.deadline`),
      status: oneOf(t.status, `${f}.status`, ["open", "blocked", "funded", "carries"]),
    };
  });
  unique(targets, "funding target");
  return { targets, total_target_cad: number(fu.total_target_cad, "funding.total_target_cad") };
}
function payables(value) {
  const rows = list(value, "payables", CAPS.payables).map((p, i) => {
    const f = `payables[${i}]`;
    return {
      id: text(p.id, `${f}.id`, 32) || `row-${i + 1}`,
      priority: count(p.priority, `${f}.priority`),
      type: oneOf(p.type, `${f}.type`, ["payable", "receivable"]),
      entity: text(p.entity, `${f}.entity`, 40),
      counterparty: text(p.counterparty, `${f}.counterparty`, 120),
      description: text(p.description, `${f}.description`, 240),
      amount: number(p.amount, `${f}.amount`),
      currency: currency(p.currency, `${f}.currency`),
      due_date: date(p.due_date, `${f}.due_date`),
      due_note: text(p.due_note, `${f}.due_note`, 40),
      status: text(p.status, `${f}.status`, 80),
      last_checked: date(p.last_checked, `${f}.last_checked`),
    };
  });
  unique(rows, "payable");
  return rows;
}
function cabin(c) {
  const t = c.t12 === undefined || c.t12 === null ? {} : object(c.t12, "cabin.t12");
  return {
    last_statement_month: date(c.last_statement_month, "cabin.last_statement_month", { month: true }),
    nights: count(c.nights, "cabin.nights"),
    gross_cad: number(c.gross_cad, "cabin.gross_cad"),
    sales_taxes_cad: number(c.sales_taxes_cad, "cabin.sales_taxes_cad"),
    deposit_cad: number(c.deposit_cad, "cabin.deposit_cad"),
    net_ex_tax_cad: number(c.net_ex_tax_cad, "cabin.net_ex_tax_cad"),
    t12: {
      nights: count(t.nights, "cabin.t12.nights"),
      gross_cad: number(t.gross_cad, "cabin.t12.gross_cad"),
      net_ex_tax_cad: number(t.net_ex_tax_cad, "cabin.t12.net_ex_tax_cad"),
      owner_costs_cad: number(t.owner_costs_cad, "cabin.t12.owner_costs_cad"),
      interest_cad: number(t.interest_cad, "cabin.t12.interest_cad"),
      noi_cad: number(t.noi_cad, "cabin.t12.noi_cad"),
    },
    statements_on_file: count(c.statements_on_file, "cabin.statements_on_file"),
  };
}
function books(b) {
  const t = b.tieouts === undefined || b.tieouts === null ? {} : object(b.tieouts, "books.tieouts");
  return {
    suspense_cad: number(b.suspense_cad, "books.suspense_cad"),
    trial_balance_cad: number(b.trial_balance_cad, "books.trial_balance_cad"),
    balanced: bool(b.balanced, "books.balanced"),
    tieouts: {
      ties: count(t.ties, "books.tieouts.ties"),
      fails: count(t.fails, "books.tieouts.fails"),
      other: count(t.other, "books.tieouts.other"),
    },
    due_from_ensemble_cad: number(b.due_from_ensemble_cad, "books.due_from_ensemble_cad"),
    as_of: date(b.as_of, "books.as_of"),
  };
}
function openItems(o) {
  return {
    to_clarify_open: count(o.to_clarify_open, "open_items.to_clarify_open"),
    batches: count(o.batches, "open_items.batches"),
    open_questions: count(o.open_questions, "open_items.open_questions"),
    oldest_open: date(o.oldest_open, "open_items.oldest_open"),
    next_question_id: count(o.next_question_id, "open_items.next_question_id"),
  };
}
function names(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`${field} must be a list.`);
  if (value.length > CAPS.agents) throw Error(`${field} exceeds ${CAPS.agents} names.`);
  return value.map((n) => text(n, field, 40)).filter(Boolean);
}
// Hex identifiers are validated raw: the digit mask must not touch them.
function hex(value, field, pattern, message) {
  if (blank(value)) return null;
  if (typeof value !== "string" || !pattern.test(value)) throw Error(`${field} must be ${message} or null.`);
  return value;
}
function contract(c) {
  const hash = hex(c.hash, "contract.hash", /^[0-9a-f]{12}$/, "12 lowercase hex characters");
  return {
    version: text(c.version, "contract.version", 20),
    hash,
    required: names(c.required, "contract.required"),
    acked: names(c.acked, "contract.acked"),
    grace_until: date(c.grace_until, "contract.grace_until"),
  };
}
// Account identifiers: at most four digits each, never masked into "...".
function last4(value, field) {
  if (/\d{5,}/.test(String(value ?? ""))) throw Error(`${field} must keep at most four digits.`);
  return text(value, field, 12);
}
function last4List(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`${field} must be a list.`);
  if (value.length > CAPS.interest_accounts) throw Error(`${field} exceeds ${CAPS.interest_accounts} accounts.`);
  return value.map((v, i) => last4(v, `${field}[${i}]`)).filter(Boolean);
}
function freshnessRows(value) {
  return list(value, "freshness", CAPS.freshness).map((r, i) => {
    const f = `freshness[${i}]`;
    return {
      last4: last4(r.last4, `${f}.last4`),
      label: text(r.label, `${f}.label`, 80),
      entity: text(r.entity, `${f}.entity`, 40),
      newest_row: date(r.newest_row, `${f}.newest_row`),
      cadence_days: count(r.cadence_days, `${f}.cadence_days`),
      stale: bool(r.stale, `${f}.stale`),
      feed: text(r.feed, `${f}.feed`, 20),
    };
  });
}
function sources(value) {
  if (value === undefined || value === null) return [];
  const entries = Object.entries(object(value, "sources"));
  if (entries.length > CAPS.sources) throw Error(`sources exceeds ${CAPS.sources} entries.`);
  // Normalized to sorted [file, note] pairs; a date-shaped note stays a date.
  return entries
    .map(([k, v]) => {
      const key = text(k, "sources.key", 80);
      return [key, text(v, `sources.${key.slice(0, 40)}`, 60)];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export function validateMetrics(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Metrics must be an object.");
  if (raw.schema !== SCHEMA) throw Error(`Metrics schema must be ${SCHEMA}.`);
  const sha = hex(raw.moneyos_sha, "moneyos_sha", /^[0-9a-f]{7,40}$/, "7 to 40 lowercase hex characters");
  const inputsHash = hex(raw.inputs_hash, "inputs_hash", /^[0-9a-f]{12}$/, "12 lowercase hex characters");
  const builtFrom = hex(raw.built_from_head, "built_from_head", /^[0-9a-f]{7,40}$/, "7 to 40 lowercase hex characters");
  const ns = raw.north_star === undefined || raw.north_star === null ? {} : object(raw.north_star, "north_star");
  const pnl = list(raw.pnl_monthly, "pnl_monthly", CAPS.pnl_monthly).map(pnlRow);
  unique(pnl, "pnl_monthly", "month");
  const interest = list(raw.interest_by_month, "interest_by_month", CAPS.interest_by_month).map(interestRow);
  unique(interest, "interest_by_month", "month");
  const out = {
    schema: SCHEMA,
    generated_at: dateTime(raw.generated_at, "generated_at"),
    inputs_hash: inputsHash,
    built_from_head: builtFrom,
    moneyos_sha: sha,
    verdicts_as_of: dateTime(raw.verdicts_as_of, "verdicts_as_of"),
    ledger_through: date(raw.ledger_through, "ledger_through"),
    freshness: freshnessRows(raw.freshness),
    north_star: { savings_rate: optional(ns.savings_rate, "north_star.savings_rate", savingsRate) },
    burn: optional(raw.burn, "burn", burn),
    pnl_monthly: pnl,
    income_by_source_t12: list(raw.income_by_source_t12, "income_by_source_t12", CAPS.income_by_source_t12).map((r, i) => ({
      source: text(r.source, `income_by_source_t12[${i}].source`, 120),
      cad: number(r.cad, `income_by_source_t12[${i}].cad`),
      share_pct: number(r.share_pct, `income_by_source_t12[${i}].share_pct`),
    })),
    spend_by_line: optional(raw.spend_by_line, "spend_by_line", spend),
    interest_by_month: interest,
    debts: optional(raw.debts, "debts", debts),
    liquidity: optional(raw.liquidity, "liquidity", liquidity),
    net_worth: optional(raw.net_worth, "net_worth", netWorth),
    funding: optional(raw.funding, "funding", funding),
    payables: payables(raw.payables),
    cabin: optional(raw.cabin, "cabin", cabin),
    books: optional(raw.books, "books", books),
    open_items: optional(raw.open_items, "open_items", openItems),
    contract: optional(raw.contract, "contract", contract),
    // The file carries an object; the normalized form is sorted pairs, which round-trip.
    sources: Array.isArray(raw.sources) ? sources(Object.fromEntries(pairs(raw.sources, "sources"))) : sources(raw.sources),
  };
  if (JSON.stringify(out).length > MAX_JSON_BYTES) throw Error("Metrics are too large after normalization.");
  return out;
}

// Text transport: size bound before parse, then validation. Returns a reason
// that names the field, never the content.
export function readMetricsText(textValue) {
  if (typeof textValue !== "string" || !textValue.length) return { state: "fallback", reason: "empty response", metrics: emptyMetrics() };
  if (new TextEncoder().encode(textValue).length > MAX_JSON_BYTES) return { state: "fallback", reason: `file larger than ${MAX_JSON_BYTES / 1000} KB`, metrics: emptyMetrics() };
  let parsed;
  try {
    parsed = JSON.parse(textValue);
  } catch {
    return { state: "fallback", reason: "file is not valid JSON", metrics: emptyMetrics() };
  }
  try {
    return { state: "ready", reason: "", metrics: validateMetrics(parsed) };
  } catch (error) {
    return { state: "fallback", reason: `validation: ${error.message}`, metrics: emptyMetrics() };
  }
}

// ---- derivations for the page (pure; the clock is a parameter) ----
export const STALE_GENERATED_HOURS = 36;
// Past this age the refresh job has stopped; the page shows a red notice, not just the stale banner.
export const ABANDONED_GENERATED_DAYS = 14;
export const STALE_BURN_DAYS = 3;
export const STALE_LEDGER_DAYS = 7;
export const STALE_SAVINGS_RATE_DAYS = 45;

// Whether an account row is stale, recomputed against today's date: the newest
// row is older than the account's cadence. The record's own flag (computed at
// verdicts_as_of) is used only when the date or the cadence is missing.
export function accountStale(row, today) {
  if (row.newest_row && row.cadence_days !== null && row.cadence_days !== undefined) {
    const d = daysBetween(row.newest_row, today);
    if (d !== null) return d > row.cadence_days;
  }
  return row.stale === true;
}

// The verdict for the status bar: the file's age and its headline inputs.
// Per-account staleness is counted separately so one dead feed does not paint
// every figure red; the freshness table highlights the rows.
// `today` is the page's own calendar date (America/Toronto); it defaults to the UTC
// date of nowMs for callers without one, so the table and the verdict never disagree.
export function metricsFreshness(m, nowMs = Date.now(), today = new Date(nowMs).toISOString().slice(0, 10)) {
  const reasons = [];
  const gen = m.generated_at ? Date.parse(m.generated_at) : NaN;
  const ageHours = Number.isFinite(gen) ? (nowMs - gen) / 3600000 : null;
  if (ageHours === null) reasons.push("Generated time is unknown.");
  else if (ageHours > STALE_GENERATED_HOURS) reasons.push(`Metrics generated ${Math.floor(ageHours)} hours ago (limit ${STALE_GENERATED_HOURS}).`);
  const inputs = [
    ["Ledger", m.ledger_through, STALE_LEDGER_DAYS],
    ["Burn", m.burn ? m.burn.as_of : undefined, STALE_BURN_DAYS],
    ["Savings rate", m.north_star.savings_rate ? m.north_star.savings_rate.as_of : undefined, STALE_SAVINGS_RATE_DAYS],
  ];
  for (const [name, asOf, limit] of inputs) {
    if (asOf === undefined) continue;
    if (!asOf) reasons.push(`${name}: date unknown.`);
    else {
      const d = daysBetween(asOf, today);
      if (d > limit) reasons.push(`${name}: through ${asOf}, ${d} days old (limit ${limit}).`);
    }
  }
  const staleAccounts = m.freshness.filter((r) => accountStale(r, today)).length;
  const generatedDays = ageHours === null ? null : Math.floor(ageHours / 24);
  return {
    stale: reasons.length > 0,
    reasons,
    ageHours,
    generatedDays,
    abandoned: ageHours !== null && ageHours > ABANDONED_GENERATED_DAYS * 24,
    staleAccounts,
    accounts: m.freshness.length,
  };
}

// North Star verdict against the 20% target (the file's own target wins when present).
export function savingsVerdict(ratePct, targetPct = SAVINGS_TARGET_PCT) {
  const target = targetPct === null || targetPct === undefined ? SAVINGS_TARGET_PCT : targetPct;
  if (ratePct === null || ratePct === undefined) return { tag: "unknown", gapPct: null, target };
  const gapPct = Math.round((ratePct - target) * 10) / 10;
  return { tag: ratePct >= target ? "on target" : "below target", gapPct, target };
}

// Crypto share of income for one month; unknown when either side is unknown.
export function sharePct(part, whole) {
  if (part === null || whole === null || part === undefined || whole === undefined || !whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

// Cash of one entity row as text: a null with missing accounts says which balances are missing.
export function entityCashText(row, fmt = (n) => String(n)) {
  if (row.cash !== null) return `${row.currency} ${fmt(row.cash)}`;
  return row.missing_accounts.length ? `unknown (balance missing for ${row.missing_accounts.map((a) => `…${a}`).join(", ")})` : "unknown";
}

// Runway as a sentence; a null stays "unknown" with the method beside it.
export function runwayText(liquidity) {
  if (!liquidity) return "unknown";
  const months = liquidity.runway_months_personal;
  if (months === null) return `unknown${liquidity.runway_method ? ` (${liquidity.runway_method})` : ""}`;
  const whole = Number.isInteger(months) ? String(months) : months.toFixed(1);
  return `${whole} month${months === 1 ? "" : "s"}${liquidity.runway_method ? ` (${liquidity.runway_method})` : ""}`;
}

// Payables in camelCase so the cash-model tagging rules (overdue, due soon,
// held statuses) apply unchanged.
export function metricsPayableRows(m, today) {
  const payablesCamel = m.payables.map((p) => ({
    id: p.id,
    priority: p.priority,
    type: p.type,
    entity: p.entity,
    counterparty: p.counterparty,
    description: p.description,
    amount: p.amount,
    currency: p.currency,
    dueDate: p.due_date,
    dueNote: p.due_note,
    status: p.status,
    source: "",
    lastChecked: p.last_checked,
  }));
  return payableRows({ payables: payablesCamel }, today);
}

// Funding targets in camelCase so the cash-model rules (overdue, due soon,
// unverified) apply unchanged; a null status stays null and gets no tag.
export function metricsFundingRows(m, today) {
  if (!m.funding) return [];
  const derived = fundingRows(
    {
      fundingTargets: m.funding.targets.map((t) => ({
        id: t.id,
        label: t.label,
        targetCad: t.target_cad,
        deadline: t.deadline,
        contributedCad: t.contributed_cad,
        contributedAsOf: t.contributed_as_of,
        status: t.status,
      })),
    },
    today,
  );
  return m.funding.targets.map((t, i) => ({ ...t, days: derived[i].days, remaining: derived[i].remaining, tag: derived[i].tag }));
}

// Debt figures per entity only: facilities, known balance and known monthly
// interest with the number of rows each covers. Nothing here spans entities;
// the record's own total is shown separately, labelled as the record's.
export function debtsByEntity(m) {
  if (!m.debts) return [];
  const groups = new Map();
  for (const d of m.debts.rows) {
    const key = d.entity || "entity unknown";
    const g = groups.get(key) ?? { entity: key, facilities: 0, balance_cad: 0, balanceRows: 0, interest_month_cad: 0, interestRows: 0, as_of: null };
    g.facilities++;
    if (d.balance_cad !== null) {
      g.balance_cad += d.balance_cad;
      g.balanceRows++;
      if (d.as_of && (!g.as_of || d.as_of < g.as_of)) g.as_of = d.as_of;
    }
    if (d.interest_month_cad !== null) {
      g.interest_month_cad += d.interest_month_cad;
      g.interestRows++;
    }
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    balance_cad: g.balanceRows ? round2(g.balance_cad) : null,
    interest_month_cad: g.interestRows ? round2(g.interest_month_cad) : null,
  }));
}

export function metricsContractStatus(m, today) {
  const c = m.contract;
  if (!c) return { missing: [], afterGrace: false, overdue: false };
  const missing = c.required.filter((a) => !c.acked.includes(a));
  const afterGrace = c.grace_until ? daysBetween(c.grace_until, today) > 0 : false;
  return { missing, afterGrace, overdue: missing.length > 0 && afterGrace };
}

const fmtAmount = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// "Needs you soon": only what leads to an action or a decision within seven
// days: overdue or imminent payables, blocked or overdue funding, open
// questions waiting for an answer, a contract acknowledgement missing after grace.
export function needsYou(m, today) {
  const out = [];
  for (const p of metricsPayableRows(m, today))
    if (p.type !== null && p.actionable && (p.tag === "overdue" || (p.days !== null && p.days <= 7)))
      out.push({
        when: p.when,
        days: p.days,
        who: "gui",
        text: `${p.counterparty || p.description || p.id}${p.amount === null ? "" : `: ${p.currency} ${fmtAmount(p.amount)}`}${p.dueNote ? ` (${p.dueNote})` : ""}`,
        kind: p.type,
      });
  for (const f of metricsFundingRows(m, today))
    if (f.status !== null && (f.tag === "blocked" || f.tag === "overdue"))
      out.push({ when: f.deadline, days: f.days, who: "gui", text: `${f.label || f.id}: ${f.tag}`, kind: `funding ${f.tag}` });
  if (m.open_items && m.open_items.open_questions)
    out.push({
      when: m.open_items.oldest_open,
      days: null,
      who: "gui",
      text: `${m.open_items.open_questions} open question${m.open_items.open_questions === 1 ? "" : "s"} waiting for your answer${m.open_items.oldest_open ? ` (oldest ${m.open_items.oldest_open})` : ""}`,
      kind: "ruling",
    });
  const ack = metricsContractStatus(m, today);
  if (ack.overdue)
    out.push({ when: m.contract.grace_until, days: null, who: "bot", text: `Contract acknowledgement missing after grace: ${ack.missing.join(", ")}`, kind: "contract" });
  return out.sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
}
