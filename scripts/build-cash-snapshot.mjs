// Build cash_snapshot_v1 from a LOCAL checkout of the private Context repo
// (cfo-feed/). Output is a private managed-environment value, never committed.
//   node scripts/build-cash-snapshot.mjs [--out path] [--gzip]
// Env: CONTEXT_DIR (default ~/Context). Reads cfo-feed/data/*.json, debts.csv,
// state.json and the funding-targets table in TARGETS.md section 1.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseCsv } from "../lib/finance-model.mjs";
import { SCHEMA, validateCash, readCash } from "../lib/cash-model.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const feedDir = join(process.env.CONTEXT_DIR || join(homedir(), "Context"), "cfo-feed");
const out = flag("--out");
const wantGzip = args.includes("--gzip");
const read = (file, optional = false) => {
  const path = join(feedDir, file);
  if (!existsSync(path)) {
    if (optional) return null;
    throw Error(`Missing ${path}`);
  }
  return readFileSync(path, "utf8");
};
const json = (file, optional) => {
  const text = read(file, optional);
  return text === null ? null : JSON.parse(text);
};
const nz = (v) => (v === undefined || v === "" ? null : v);
const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const monthOrDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : null);
// Keep at most the last four digits of any longer digit run (account masking).
const mask = (s) => String(s ?? "").replace(/\d{5,}/g, (m) => `...${m.slice(-4)}`);
const amountInText = (s) => {
  const m = /(?:CA\$|\$|CAD\s*)\s*([\d,]+(?:\.\d+)?)/.exec(s || "");
  return m ? num(m[1]) : null;
};

const facts = json("data/facts.json");
const t30d = json("data/t30d.json", true);
const scorecard = json("data/scorecard.json", true);
const tasks = json("data/tasks.json", true);
const interest = json("data/interest_summary.json", true);
const state = json("state.json", true);
const debtsCsv = read("data/debts.csv", true);
const targetsMd = read("TARGETS.md", true);
const updated = facts.updated ?? null;
const seriesCsv = read("data/t30d-net-burn.csv", true);

// Last 180 complete daily points of the T30D series, whole CAD, to keep the env value small.
const SERIES_DAYS = 180;
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
    source: "cfo-feed/TARGETS.md section 1",
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
  scorecard: scorecard
    ? {
        asOf: scorecard.as_of ?? null,
        lastFullMonth: {
          month: scorecard.personal_net_last_full_month?.month ?? null,
          cad: num(scorecard.personal_net_last_full_month?.cad),
          source: scorecard.personal_net_last_full_month?.source ?? "",
        },
        trend: scorecard.trend ?? "",
        savingsPlanCadMo: num(scorecard.savings_plan_cad_mo),
        savingsBankedCadMo: num(scorecard.savings_banked_cad_mo),
        corpMovedCount: num(scorecard.corp_moved_count),
        corpTotalCount: num(scorecard.corp_total_count),
        corpMovedCadMo: num(scorecard.corp_moved_cad_mo),
        corpTotalCadMo: num(scorecard.corp_total_cad_mo),
      }
    : null,
  // Login names, URLs, card digits and search strings are dropped on purpose.
  tasks: (tasks?.tasks ?? []).map((t) => ({
    id: t.id,
    who: t.who === "bot" ? "bot" : "gui",
    kind: t.kind ?? "",
    title: mask(t.title),
    deadline: t.deadline ?? null,
    burnCadMo: num(t.burn_cad_mo),
    done: t.done ?? null,
    effective: t.effective ?? null,
    why: mask(t.why ?? ""),
  })),
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
console.error(
  `cash_snapshot_v1: ${bytes} bytes JSON (${bytes <= 48000 ? "fits" : "EXCEEDS"} CASH_SNAPSHOT_JSON), ${gz.length} bytes gzip-base64; ` +
    `${validated.entities.length} entities, ${validated.taxItems.length} tax items, ${validated.fundingTargets.length} funding targets, ` +
    `${validated.debts.length} debts, ${validated.tasks.length} tasks${out ? ` -> ${out}` : ""}`,
);
