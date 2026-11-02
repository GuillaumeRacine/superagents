// Build cash_snapshot_v1 from a LOCAL clone of the private MoneyOS repository
// (main). Output is a private managed-environment value, never committed.
//   node scripts/build-cash-snapshot.mjs [--out path] [--gzip]
// Env: MONEYOS_DIR (default ~/code/moneyos) for data/cfo-feed/*, reports/TARGETS.md,
// data/savings-rate.csv, books/trial-balance.csv, data/tieout.csv,
// data/payables-receivables.csv, clarify/*.csv, data/cabin-statements.csv,
// ACK.md and sources.json (+ SOURCE_OF_TRUTH.md for the contract hash).
// CONTEXT_DIR (default ~/Context) only for cfo-feed/state.json, the feed's
// memory, until the feed job moves into the MoneyOS repo (moneyos#1 phase 3).
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseCsv } from "../lib/finance-model.mjs";
import { SCHEMA, MAX_PAYABLES, validateCash, readCash } from "../lib/cash-model.mjs";
import { ackedAgents, contractHash } from "../lib/moneyos-contract.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const moneyosDir = process.env.MONEYOS_DIR || join(homedir(), "code", "moneyos");
const contextFeedDir = join(process.env.CONTEXT_DIR || join(homedir(), "Context"), "cfo-feed");
const out = flag("--out");
const wantGzip = args.includes("--gzip");
function fail(message) {
  console.error(`build-cash-snapshot: ${message}`);
  process.exit(2);
}
if (!existsSync(moneyosDir) || !statSync(moneyosDir).isDirectory())
  fail(`MONEYOS_DIR ${moneyosDir} is not a directory. Clone the private MoneyOS repository (main) there or set MONEYOS_DIR.`);
if (!existsSync(join(moneyosDir, "data", "cfo-feed", "facts.json")))
  fail(`${moneyosDir} has no data/cfo-feed/facts.json. Is it the MoneyOS repo, on a branch that carries the feed data?`);
const readFrom = (dir) => (file, optional = false) => {
  const path = join(dir, file);
  if (!existsSync(path)) {
    if (optional) return null;
    fail(`Missing ${path}`);
  }
  return readFileSync(path, "utf8");
};
const read = readFrom(moneyosDir);
const readContext = readFrom(contextFeedDir);
const json = (file, optional) => {
  const text = read(file, optional);
  return text === null ? null : JSON.parse(text);
};
// A record file that exists but does not parse fails the build (exit 2) so the
// refresh job keeps its last good snapshot instead of publishing "section absent".
const csvRows = (file) => {
  const text = read(file, true);
  if (text === null) return null;
  try {
    return parseCsv(text).rows;
  } catch (error) {
    return fail(`${file} does not parse (${error.message}); refusing to build a partial snapshot`);
  }
};
const todayUtc = new Date().toISOString().slice(0, 10);
const nz = (v) => (v === undefined || v === "" ? null : v);
const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const monthOrDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : null);
const dateOnly = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const monthEnd = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
// Keep at most the last four digits of any longer digit run (account masking).
const mask = (s) => String(s ?? "").replace(/\d{5,}/g, (m) => `...${m.slice(-4)}`);
// Logins, URLs and search strings never reach the snapshot.
const dropUrls = (s) => String(s ?? "").replace(/\bhttps?:\/\/\S+/gi, "[url]");
const clean = (s) => mask(dropUrls(s)).trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const amountInText = (s) => {
  const m = /(?:CA\$|\$|CAD\s*)\s*([\d,]+(?:\.\d+)?)/.exec(s || "");
  return m ? num(m[1]) : null;
};

const facts = json("data/cfo-feed/facts.json");
const t30d = json("data/cfo-feed/t30d.json", true);
const scorecard = json("data/cfo-feed/scorecard.json", true);
const tasks = json("data/cfo-feed/tasks.json", true);
const interest = json("data/cfo-feed/interest_summary.json", true);
const stateText = readContext("state.json", true);
const state = stateText === null ? null : JSON.parse(stateText);
const debtsCsv = read("data/cfo-feed/debts.csv", true);
const targetsMd = read("reports/TARGETS.md", true);
const updated = facts.updated ?? null;
const seriesCsv = read("data/cfo-feed/t30d-net-burn.csv", true);

// Last 180 complete daily points of the T30D series, whole CAD, to keep the env value small.
const SERIES_DAYS = 60; // 180 pushed the shared 64 KB Vercel env budget over the limit on 2026-11-02 (finance snapshot ~48 KB)
function seriesRows() {
  if (!seriesCsv) return [];
  const { rows } = parseCsv(seriesCsv);
  return rows
    // Partial (still-syncing) days would show a false drop; keep complete days only.
    .filter((r) => !r.status || r.status === "complete")
    .map((r) => [r.date, num(r.t30d_net_burn_cad)])
    .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && v !== null)
    .slice(-SERIES_DAYS)
    .map(([d, v]) => [d, Math.round(v)]);
}

// --- funding targets from TARGETS.md section 1 (a markdown table) ---
function fundingFromTargets(md) {
  if (!md) return { targets: [], total: null };
  const section = md.split(/^## /m).find((s) => s.startsWith("1."));
  if (!section) return { targets: [], total: null };
  const rows = section
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= 3 && !/^-+$/.test(c[1]) && c[0] !== "Target");
  const ids = [
    [/^RRSP/i, "rrsp"],
    [/^TFSA/i, "tfsa"],
    [/^RESP Theo/i, "resp-theo"],
    [/^RESP Mila/i, "resp-mila"],
  ];
  const targets = [];
  let total = null;
  for (const [label, amount, deadline, status, source, evidence] of rows) {
    const clean = label.replace(/\*/g, "");
    if (/^Total/i.test(clean)) {
      total = num(amount.replace(/\*/g, ""));
      continue;
    }
    const id = ids.find(([re]) => re.test(clean))?.[1];
    if (!id) continue;
    const deadlineDate = /\d{4}-\d{2}-\d{2}/.exec(deadline)?.[0] ?? null;
    targets.push({
      id,
      label: clean,
      targetCad: num(amount),
      deadline: deadlineDate,
      // Null until a statement proves it; the table's status text is kept as a note.
      contributedCad: null,
      contributedAsOf: null,
      status: /blocked/i.test(status) ? "blocked" : /carries/i.test(deadline) ? "carries" : "open",
      statusNote: status,
      evidence: mask(evidence ?? ""),
      source: source ?? "",
    });
  }
  return { targets, total };
}
const funding = fundingFromTargets(targetsMd);

// --- debts (CSV) joined with interest run rates ---
function debtRows() {
  if (!debtsCsv) return [];
  const { rows } = parseCsv(debtsCsv);
  const col = (row, name) => nz(row[name]);
  const byId = new Map((interest?.summary ?? []).map((s) => [s.debt_id, s]));
  return rows.map((row) => {
    const idv = col(row, "debt_id");
    const s = byId.get(idv);
    const year = num(s?.run_rate_year);
    return {
      id: idv,
      name: mask(col(row, "name")),
      scope: col(row, "scope") ?? "",
      lender: col(row, "lender") ?? "",
      kind: col(row, "kind") ?? "",
      balanceCad: num(col(row, "latest_balance_cad")),
      balanceAsOf: monthOrDate(col(row, "balance_as_of")),
      ratePct: num(col(row, "rate_pct")),
      rateNote: col(row, "rate_note") ?? "",
      interestMonthCad: year === null ? null : Math.round((year / 12) * 100) / 100,
      interestBasis: s?.run_rate_basis ? `${s.run_rate_basis} / 12` : "",
    };
  });
}

// --- savings rate (North Star): data/savings-rate.csv, one headline column ---
const SAVINGS_RATE_DEFINITION =
  "(income − opex) / income, personal entity only; income includes crypto sales at full proceeds and excludes Stoic loan repayments; opex = spending + interest + fees; principal is capital. Target 20%+.";
function savingsRate() {
  const rows = csvRows("data/savings-rate.csv");
  if (!rows || !rows.length) return null;
  const col = "savings_rate" in rows[0] ? "savings_rate" : "savings_rate_incl" in rows[0] ? "savings_rate_incl" : null;
  if (!col) return null;
  const pctOf = (r) => {
    const v = num(r[col]);
    return v === null ? null : Math.round(v * 1000) / 10;
  };
  // Newest month by month string, not by file order.
  const months = rows
    .filter((r) => /^\d{4}-(0[1-9]|1[0-2])$/.test(r.month ?? ""))
    .sort((a, b) => a.month.localeCompare(b.month));
  const t12 = [...rows].reverse().find((r) => /^(TTM|T12)/i.test(r.month ?? ""));
  const last = months[months.length - 1] ?? null;
  let t12Label = "";
  if (t12) {
    const m = /^T12_(\d{4}-\d{2})_(\d{4}-\d{2})$/.exec(t12.month);
    t12Label = m ? `T12 ${m[1]} to ${m[2]}` : t12.month.replace(/_/g, " ");
  }
  return {
    month: last?.month ?? null,
    monthRatePct: last ? pctOf(last) : null,
    monthStatus: clip(clean(last?.status), 200),
    t12Label,
    t12RatePct: t12 ? pctOf(t12) : null,
    definition: SAVINGS_RATE_DEFINITION,
    // The rate covers the newest month on file, so its as-of is that month's end.
    asOf: last ? monthEnd(last.month) : null,
    source: `moneyos data/savings-rate.csv (${col})`,
  };
}

// --- books: suspense and total from the trial balance, tie-out counts ---
function books() {
  const tb = csvRows("books/trial-balance.csv");
  const tie = csvRows("data/tieout.csv");
  if (!tb && !tie) return null;
  const lastCol = (r) => {
    const values = Object.values(r);
    return num(values[values.length - 1]);
  };
  const nameOf = (r) => r.account ?? Object.values(r)[1] ?? "";
  const suspense = tb?.find((r) => /suspense/i.test(nameOf(r)));
  const total = tb?.find((r) => /^total$/i.test(nameOf(r).trim()));
  const trialBalance = total ? lastCol(total) : null;
  const suspenseCad = suspense ? lastCol(suspense) : null;
  // The status column only: "ties", "does not tie", anything else is not tieable yet.
  let passing = null,
    failing = null,
    other = null,
    asOf = null;
  if (tie) {
    passing = 0;
    failing = 0;
    other = 0;
    for (const r of tie) {
      const status = (r.status ?? "").trim();
      if (status === "ties") passing++;
      else if (status === "does not tie") failing++;
      else other++;
      const d = dateOnly(r.stmt_date);
      if (d && (!asOf || d > asOf)) asOf = d;
    }
  }
  return {
    suspenseCad: suspenseCad === null ? null : Math.round(suspenseCad * 100) / 100,
    trialBalanceCad: trialBalance === null ? null : Math.round(trialBalance * 100) / 100,
    balanced: trialBalance === null ? null : Math.abs(trialBalance) < 0.01,
    tieOutsPassing: passing,
    tieOutsFailing: failing,
    tieOutsOther: other,
    asOf,
  };
}

// --- payables and receivables: open rows only, masked, capped ---
function payables() {
  const rows = csvRows("data/payables-receivables.csv");
  if (!rows) return [];
  const open = rows.filter((r) => !/^(paid|closed|done|settled)\b/i.test((r.status ?? "").trim()));
  // Overdue rows first, then by priority, so the cap never drops the urgent ones.
  const overdue = (r) => {
    const due = (r.due_date ?? "").trim();
    const d = dateOnly(due);
    return (d !== null && d < todayUtc) || /overdue/i.test(due) ? 0 : 1;
  };
  const ordered = open
    .map((r, i) => ({ r, i, id: (r.id ?? "").trim() || `row-${i + 1}` }))
    .sort((a, b) => overdue(a.r) - overdue(b.r) || (num(a.r.priority) ?? 999) - (num(b.r.priority) ?? 999) || a.i - b.i);
  if (ordered.length > MAX_PAYABLES)
    console.error(
      `build-cash-snapshot: payables capped at ${MAX_PAYABLES}; dropped ${ordered.length - MAX_PAYABLES} row(s): ${ordered
        .slice(MAX_PAYABLES)
        .map((x) => x.id)
        .join(", ")}`,
    );
  return ordered.slice(0, MAX_PAYABLES).map(({ r, id }) => {
      const due = (r.due_date ?? "").trim();
      const dueDate = dateOnly(due);
      return {
        id,
        priority: num(r.priority),
        type: /^receiv/i.test(r.type ?? "") ? "receivable" : "payable",
        entity: (r.entity ?? "").trim(),
        counterparty: clip(clean(r.counterparty), 120),
        description: clip(clean(r.description), 120),
        amount: num(r.amount),
        currency: /^[A-Z]{3}$/.test((r.currency ?? "").trim()) ? r.currency.trim() : "CAD",
        dueDate,
        dueNote: dueDate ? "" : clip(clean(due), 40),
        status: clip(clean(r.status), 80),
        source: "", // omitted from the snapshot: the shared 64 KB env budget (2026-11-02); the register file keeps it
        lastChecked: dateOnly(r.last_checked),
      };
    });
}

// --- clarify: open rows awaiting a ruling, open questions ---
function clarify() {
  const toClarify = csvRows("clarify/to-clarify.csv");
  const questions = csvRows("clarify/open-questions.csv");
  if (!toClarify && !questions) return null;
  const statusOf = (r) => (r.Status ?? r.status ?? "").trim().toLowerCase();
  const open = toClarify ? toClarify.filter((r) => statusOf(r) === "open") : null;
  // The page labels this "newest row awaiting a ruling": open rows only.
  let asOf = null;
  for (const r of open ?? []) {
    const d = dateOnly(r.Date ?? r.date);
    if (d && (!asOf || d > asOf)) asOf = d;
  }
  const batchKey = toClarify?.length ? Object.keys(toClarify[0]).find((k) => /batch/i.test(k)) : null;
  return {
    openToClarifyRows: open ? open.length : null,
    openQuestions: questions ? questions.filter((r) => statusOf(r) === "open").length : null,
    batches: open && batchKey ? new Set(open.map((r) => (r[batchKey] ?? "").trim()).filter(Boolean)).size : null,
    asOf,
  };
}

// --- contract: version, hash (as scripts/check_sot.py computes it) and acknowledgements ---
function contract() {
  const sourcesText = read("sources.json", true);
  if (sourcesText === null) return null;
  const sources = JSON.parse(sourcesText);
  const sotPath = join(moneyosDir, "SOURCE_OF_TRUTH.md");
  let hash = null;
  try {
    hash = existsSync(sotPath) ? contractHash(readFileSync(sotPath), sourcesText) : null;
  } catch (error) {
    console.error(
      `build-cash-snapshot: contract hash not computed (${error.message}); compare with python3 scripts/check_sot.py --hash in MONEYOS_DIR`,
    );
  }
  const acked = ackedAgents(read("ACK.md", true), hash);
  const date = dateOnly(sources.contract_date);
  // check_sot.py defaults the grace to 7 days; anything that is not a whole
  // non-negative number of days leaves the grace date unknown rather than throwing.
  const graceDays = sources.ack_grace_days ?? 7;
  const grace = Number.isInteger(graceDays) && graceDays >= 0 && graceDays <= 3650 ? graceDays : null;
  const graceUntil =
    date && grace !== null ? new Date(Date.parse(date) + grace * 86400000).toISOString().slice(0, 10) : null;
  if (grace === null) console.error(`build-cash-snapshot: sources.json ack_grace_days is not a whole number of days; grace date left unknown`);
  return {
    version: String(sources.contract_version ?? ""),
    hash,
    date,
    requiredAcks: Array.isArray(sources.required_acks) ? sources.required_acks.map(String) : [],
    ackedAgents: acked,
    graceUntil,
  };
}

// --- cabin: newest owner statement ---
function cabin() {
  const rows = csvRows("data/cabin-statements.csv");
  if (!rows) return null;
  const dated = rows.filter((r) => /^\d{4}-\d{2}$/.test(r.statement_month ?? ""));
  const last = [...dated].sort((a, b) => a.statement_month.localeCompare(b.statement_month)).pop() ?? null;
  return {
    lastStatementMonth: last?.statement_month ?? null,
    nights: last ? num(last.nights) : null,
    grossCad: last ? num(last.gross_income) : null,
    salesTaxesCad: last ? num(last.sales_taxes_collected) : null,
    depositCad: last ? num(last.statement_total) : null,
    netExTaxCad: last ? num(last.net_ex_tax) : null,
    statementsOnFile: dated.length,
  };
}

const taxItems = (facts.tax_items ?? []).map((t) => {
  const explicit = num(t.amount_cad);
  const parsed = explicit === null ? amountInText(t.text) : null;
  return {
    key: t.key,
    entity: t.entity ?? "",
    kind: t.kind === "notice" ? "notice" : "due",
    due: t.due ?? null,
    amountCad: explicit ?? parsed,
    amountBasis: explicit !== null ? "stated" : parsed !== null ? "parsed from notice text" : "",
    text: mask(t.text),
    open: t.open ?? true,
    source: t.source ?? "",
    asOf: updated,
  };
});

const savingsRateRow = savingsRate();
const snapshot = {
  schemaVersion: SCHEMA,
  generatedAt: new Date().toISOString(),
  feed: {
    lastPostDate: state?.last_post_date ?? null,
    monthlyClosed: state?.monthly_closed ?? null,
    owner: "Chief of Cash (GrokBot)",
    channel: "#cash, weekdays 08:00",
  },
  fx: {
    usdcad: num(facts.fx_note?.usdcad),
    asOf: facts.fx_note?.as_of ?? null,
    source: facts.fx_note?.source ?? "",
  },
  entities: Object.entries(facts.entities ?? {}).map(([id, e]) => ({
    id,
    label: e.label ?? id,
    note: e.note ?? "",
    balances: (e.balances ?? []).map((b) => ({
      account: mask(b.account),
      currency: b.currency,
      amount: num(b.amount),
      asOf: b.as_of ?? null,
      source: b.source ?? "",
    })),
  })),
  credit: (facts.credit ?? []).map((c) => ({
    entity: c.entity ?? "",
    account: mask(c.account),
    currency: c.currency ?? "CAD",
    limit: num(c.limit),
    drawn: num(c.drawn),
    asOf: c.as_of ?? null,
    source: c.source ?? "",
  })),
  taxItems,
  upcomingCharges: [
    ...(facts.annual_renewals ?? []).map((r) => ({
      vendor: r.vendor,
      action: "annual renewal",
      amountCad: num(r.amount_cad),
      date: r.expected ?? null,
      entity: r.entity ?? "",
      source: r.source ?? "",
    })),
    ...(facts.pending_cuts ?? []).map((c) => ({
      vendor: c.vendor,
      action: c.action ?? "",
      amountCad: num(c.amount_cad),
      date: c.next ?? null,
      entity: "",
      source: "pending cut (runbook)",
    })),
  ],
  fundingTargets: funding.targets,
  fundingPlan: {
    totalCad: funding.total,
    asOf: updated,
    source: "moneyos reports/TARGETS.md section 1",
  },
  stoicCover: {
    entityId: facts.entities?.stoic ? "stoic" : null,
    cashAsOf: null,
    claimsAsOf: updated,
    claimKeys: taxItems.filter((t) => t.entity === "stoic" && t.open).map((t) => t.key),
  },
  debts: debtRows(),
  burn: t30d
    ? {
        asOf: t30d.as_of ?? null,
        dataThroughPartial: t30d.data_through_partial ?? null,
        t30dNetBurnCad: num(t30d.t30d_net_burn_cad),
        vsYesterday: num(t30d.vs_yesterday),
        vs30dAgo: num(t30d.vs_30d_ago),
        topCategories: (t30d.top_categories ?? []).map(([n, v]) => [n, num(v)]),
        accountsLastDate: Object.fromEntries(
          Object.entries(t30d.accounts_last_date ?? {}).map(([k, v]) => [mask(k), v]),
        ),
        definition: t30d.definition ?? "",
        series: seriesRows(),
        debtService: t30d.debt_service_30d
          ? {
              start: t30d.debt_service_30d.start ?? null,
              end: t30d.debt_service_30d.end ?? null,
              interestCad: num(t30d.debt_service_30d.interest_cash),
              principalCad: num(t30d.debt_service_30d.principal_cash),
              feesCad: num(t30d.debt_service_30d.fees),
              totalCad: num(t30d.debt_service_30d.total_debt_service),
              note: t30d.debt_service_30d.note ?? "",
            }
          : null,
      }
    : null,
  // The scorecard carries the savings rate, so it exists when either input does.
  // Its as-of falls back to the savings-rate month end, so a missing scorecard.json
  // alone does not raise a permanent "date unknown" stale reason.
  scorecard:
    scorecard || savingsRateRow
      ? {
          asOf: scorecard?.as_of ?? savingsRateRow?.asOf ?? null,
          lastFullMonth: {
            month: scorecard?.personal_net_last_full_month?.month ?? null,
            cad: num(scorecard?.personal_net_last_full_month?.cad),
            source: scorecard?.personal_net_last_full_month?.source ?? "",
          },
          trend: scorecard?.trend ?? "",
          savingsPlanCadMo: num(scorecard?.savings_plan_cad_mo),
          savingsBankedCadMo: num(scorecard?.savings_banked_cad_mo),
          corpMovedCount: num(scorecard?.corp_moved_count),
          corpTotalCount: num(scorecard?.corp_total_count),
          corpMovedCadMo: num(scorecard?.corp_moved_cad_mo),
          corpTotalCadMo: num(scorecard?.corp_total_cad_mo),
          savingsRate: savingsRateRow,
        }
      : null,
  // Login names, URLs, card digits and search strings are dropped on purpose.
  tasks: (tasks?.tasks ?? []).map((t) => ({
    id: t.id,
    who: t.who === "bot" ? "bot" : "gui",
    kind: t.kind ?? "",
    title: clip(mask(t.title), 90),
    deadline: t.deadline ?? null,
    burnCadMo: num(t.burn_cad_mo),
    done: t.done ?? null,
    effective: t.effective ?? null,
    // Short: the task queue is the largest free-text section and the Vercel env budget (64 KB, shared
    // with the finance snapshot) is the binding constraint since 2026-11-02.
    why: clip(mask(t.why ?? ""), 110),
  })),
  books: books(),
  payables: payables(),
  clarify: clarify(),
  contract: contract(),
  cabin: cabin(),
};

const validated = validateCash(snapshot);
const text = JSON.stringify(validated);
const bytes = Buffer.byteLength(text);
const result = readCash(text);
if (result.state !== "ready") {
  try {
    validateCash(JSON.parse(text));
  } catch (error) {
    throw Error(`Snapshot does not round-trip (${result.state}): ${error.message}; ${bytes} bytes`);
  }
  throw Error(`Snapshot does not round-trip (${result.state}): ${bytes} bytes`);
}
const gz = gzipSync(text).toString("base64");
const payload = wantGzip ? gz : text;
if (out) writeFileSync(out, payload);
else process.stdout.write(payload);
const presence = (v) => (v ? "present" : "null");
console.error(
  `cash_snapshot_v1: ${bytes} bytes JSON (${bytes <= 48000 ? "fits" : "EXCEEDS"} CASH_SNAPSHOT_JSON), ${gz.length} bytes gzip-base64; ` +
    `${validated.entities.length} entities, ${validated.taxItems.length} tax items, ${validated.fundingTargets.length} funding targets, ` +
    `${validated.debts.length} debts, ${validated.tasks.length} tasks, ${validated.payables.length} payables; ` +
    `savingsRate ${presence(validated.scorecard?.savingsRate)}, books ${presence(validated.books)}, clarify ${presence(validated.clarify)}, ` +
    `contract ${validated.contract ? `present (hash ${validated.contract.hash ?? "null"}, acked ${validated.contract.ackedAgents.length}/${validated.contract.requiredAcks.length})` : "null"}, ` +
    `cabin ${presence(validated.cabin)}${out ? ` -> ${out}` : ""}`,
);
