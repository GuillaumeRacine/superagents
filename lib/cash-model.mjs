// Pure, shared validation and arithmetic for the Cash dashboard (cash_snapshot_v1).
// Private records are runtime inputs only. Rules: null means unknown and is never
// coerced to 0; balances are never summed across entities; every number carries
// an as-of date; the site derives, it does not invent.
export const SCHEMA = "cash_snapshot_v1";
const MAX_JSON_BYTES = 48000;
const MAX_NORMALIZED_BYTES = 200000;
const MAX_ROWS = 500;
const MAX_TEXT = 600;
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const emptyCash = () => ({
  schemaVersion: SCHEMA,
  generatedAt: null,
  feed: { lastPostDate: null, monthlyClosed: null, owner: "", channel: "" },
  fx: { usdcad: null, asOf: null, source: "" },
  entities: [],
  credit: [],
  taxItems: [],
  upcomingCharges: [],
  fundingTargets: [],
  fundingPlan: { totalCad: null, asOf: null, source: "" },
  stoicCover: {
    entityId: null,
    cashAsOf: null,
    claimsAsOf: null,
    claimKeys: [],
  },
  debts: [],
  burn: null,
  scorecard: null,
  tasks: [],
  // MoneyOS record sections (issue #54); absent in older snapshots.
  books: null,
  payables: [],
  clarify: null,
  contract: null,
  cabin: null,
});

export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function date(value, field, { month = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  if (validDate(value) || (month && validMonth(value))) return value;
  throw Error(`${field} must be an ISO date${month ? " or month" : ""}.`);
}
function number(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw Error(`${field} must be a finite number or null.`);
  if (Math.abs(value) > 1e12) throw Error(`${field} is outside the range.`);
  return value;
}
function bool(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "boolean") throw Error(`${field} must be true, false or null.`);
  return value;
}
// A non-negative whole number (a row count); null means unknown.
function count(value, field) {
  const n = number(value, field);
  if (n !== null && (!Number.isInteger(n) || n < 0))
    throw Error(`${field} must be a whole number of rows.`);
  return n;
}
function text(value, field, max = MAX_TEXT) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw Error(`${field} must be text.`);
  if (value.length > max) throw Error(`${field} is longer than ${max}.`);
  return value.trim();
}
function id(value, field) {
  if (typeof value !== "string" || !ID.test(value))
    throw Error(`${field} must be a short lowercase id.`);
  return value;
}
function currency(value, field) {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw Error(`${field} must be a three-letter currency code.`);
  return value;
}
function oneOf(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!allowed.includes(value)) throw Error(`${field} must be one of ${allowed}.`);
  return value;
}
function list(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`${field} must be a list.`);
  if (value.length > MAX_ROWS) throw Error(`${field} exceeds ${MAX_ROWS} rows.`);
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw Error(`${field} rows must be objects.`);
    return row;
  });
}
function object(value, field) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw Error(`${field} must be an object.`);
  return value;
}
function unique(rows, field) {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) throw Error(`Duplicate ${field} id ${row.id}.`);
    seen.add(row.id);
  }
}

export function validateCash(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Snapshot must be an object.");
  if (raw.schemaVersion !== SCHEMA)
    throw Error(`Snapshot schemaVersion must be ${SCHEMA}.`);
  const feed = object(raw.feed, "feed"),
    fx = object(raw.fx, "fx"),
    plan = object(raw.fundingPlan, "fundingPlan"),
    cover = object(raw.stoicCover, "stoicCover");
  const out = {
    schemaVersion: SCHEMA,
    generatedAt: text(raw.generatedAt, "generatedAt", 40) || null,
    feed: {
      lastPostDate: date(feed.lastPostDate, "feed.lastPostDate"),
      monthlyClosed: date(feed.monthlyClosed, "feed.monthlyClosed", {
        month: true,
      }),
      owner: text(feed.owner, "feed.owner", 120),
      channel: text(feed.channel, "feed.channel", 120),
    },
    fx: {
      usdcad: number(fx.usdcad, "fx.usdcad"),
      asOf: date(fx.asOf, "fx.asOf"),
      source: text(fx.source, "fx.source"),
    },
    entities: list(raw.entities, "entities").map((e, i) => ({
      id: id(e.id, `entities[${i}].id`),
      label: text(e.label, `entities[${i}].label`, 120) || e.id,
      note: text(e.note, `entities[${i}].note`),
      balances: list(e.balances, `entities[${i}].balances`).map((b, j) => {
        const f = `entities[${i}].balances[${j}]`;
        return {
          account: text(b.account, `${f}.account`, 120),
          currency: currency(b.currency, `${f}.currency`),
          amount: number(b.amount, `${f}.amount`),
          asOf: date(b.asOf, `${f}.asOf`),
          source: text(b.source, `${f}.source`, 200),
        };
      }),
    })),
    credit: list(raw.credit, "credit").map((c, i) => ({
      entity: text(c.entity, `credit[${i}].entity`, 64),
      account: text(c.account, `credit[${i}].account`, 120),
      currency: currency(c.currency, `credit[${i}].currency`),
      limit: number(c.limit, `credit[${i}].limit`),
      drawn: number(c.drawn, `credit[${i}].drawn`),
      asOf: date(c.asOf, `credit[${i}].asOf`),
      source: text(c.source, `credit[${i}].source`, 200),
    })),
    taxItems: list(raw.taxItems, "taxItems").map((t, i) => ({
      key: text(t.key, `taxItems[${i}].key`, 120),
      entity: text(t.entity, `taxItems[${i}].entity`, 64),
      kind: oneOf(t.kind, `taxItems[${i}].kind`, ["notice", "due"], "due"),
      due: date(t.due, `taxItems[${i}].due`),
      amountCad: number(t.amountCad, `taxItems[${i}].amountCad`),
      amountBasis: text(t.amountBasis, `taxItems[${i}].amountBasis`, 200),
      text: text(t.text, `taxItems[${i}].text`),
      open: t.open === undefined ? true : Boolean(t.open),
      source: text(t.source, `taxItems[${i}].source`, 200),
      asOf: date(t.asOf, `taxItems[${i}].asOf`),
    })),
    upcomingCharges: list(raw.upcomingCharges, "upcomingCharges").map(
      (u, i) => ({
        vendor: text(u.vendor, `upcomingCharges[${i}].vendor`, 120),
        action: text(u.action, `upcomingCharges[${i}].action`, 120),
        amountCad: number(u.amountCad, `upcomingCharges[${i}].amountCad`),
        date: date(u.date, `upcomingCharges[${i}].date`),
        entity: text(u.entity, `upcomingCharges[${i}].entity`, 120),
        source: text(u.source, `upcomingCharges[${i}].source`, 200),
      }),
    ),
    fundingTargets: list(raw.fundingTargets, "fundingTargets").map((t, i) => ({
      id: id(t.id, `fundingTargets[${i}].id`),
      label: text(t.label, `fundingTargets[${i}].label`, 200),
      targetCad: number(t.targetCad, `fundingTargets[${i}].targetCad`),
      deadline: date(t.deadline, `fundingTargets[${i}].deadline`),
      contributedCad: number(
        t.contributedCad,
        `fundingTargets[${i}].contributedCad`,
      ),
      contributedAsOf: date(
        t.contributedAsOf,
        `fundingTargets[${i}].contributedAsOf`,
      ),
      status: oneOf(
        t.status,
        `fundingTargets[${i}].status`,
        ["open", "blocked", "carries", "funded"],
        "open",
      ),
      statusNote: text(t.statusNote, `fundingTargets[${i}].statusNote`),
      evidence: text(t.evidence, `fundingTargets[${i}].evidence`),
      source: text(t.source, `fundingTargets[${i}].source`),
    })),
    fundingPlan: {
      totalCad: number(plan.totalCad, "fundingPlan.totalCad"),
      asOf: date(plan.asOf, "fundingPlan.asOf"),
      source: text(plan.source, "fundingPlan.source"),
    },
    stoicCover: {
      entityId: cover.entityId ? id(cover.entityId, "stoicCover.entityId") : null,
      cashAsOf: date(cover.cashAsOf, "stoicCover.cashAsOf"),
      claimsAsOf: date(cover.claimsAsOf, "stoicCover.claimsAsOf"),
      claimKeys: list(
        (cover.claimKeys ?? []).map((k) => ({ k })),
        "stoicCover.claimKeys",
      ).map(({ k }) => text(k, "stoicCover.claimKeys", 120)),
    },
    debts: list(raw.debts, "debts").map((d, i) => ({
      id: text(d.id, `debts[${i}].id`, 64),
      name: text(d.name, `debts[${i}].name`, 200),
      scope: text(d.scope, `debts[${i}].scope`, 64),
      lender: text(d.lender, `debts[${i}].lender`, 64),
      kind: text(d.kind, `debts[${i}].kind`, 64),
      balanceCad: number(d.balanceCad, `debts[${i}].balanceCad`),
      balanceAsOf: date(d.balanceAsOf, `debts[${i}].balanceAsOf`, {
        month: true,
      }),
      ratePct: number(d.ratePct, `debts[${i}].ratePct`),
      rateNote: text(d.rateNote, `debts[${i}].rateNote`),
      interestMonthCad: number(d.interestMonthCad, `debts[${i}].interestMonthCad`),
      interestBasis: text(d.interestBasis, `debts[${i}].interestBasis`),
    })),
    burn: raw.burn == null ? null : validateBurn(object(raw.burn, "burn")),
    scorecard:
      raw.scorecard == null
        ? null
        : validateScorecard(object(raw.scorecard, "scorecard")),
    tasks: list(raw.tasks, "tasks").map((t, i) => ({
      id: id(t.id, `tasks[${i}].id`),
      who: oneOf(t.who, `tasks[${i}].who`, ["gui", "bot"], "gui"),
      kind: text(t.kind, `tasks[${i}].kind`, 40),
      title: text(t.title, `tasks[${i}].title`, 300),
      deadline: date(t.deadline, `tasks[${i}].deadline`),
      burnCadMo: number(t.burnCadMo, `tasks[${i}].burnCadMo`),
      done: date(t.done, `tasks[${i}].done`),
      effective: date(t.effective, `tasks[${i}].effective`),
      why: text(t.why, `tasks[${i}].why`),
    })),
    books: raw.books == null ? null : validateBooks(object(raw.books, "books")),
    payables: validatePayables(raw.payables),
    clarify: raw.clarify == null ? null : validateClarify(object(raw.clarify, "clarify")),
    contract: raw.contract == null ? null : validateContract(object(raw.contract, "contract")),
    cabin: raw.cabin == null ? null : validateCabin(object(raw.cabin, "cabin")),
  };
  unique(out.entities, "entity");
  unique(out.fundingTargets, "funding target");
  unique(out.tasks, "task");
  unique(out.payables, "payable");
  if (
    out.stoicCover.entityId &&
    !out.entities.some((e) => e.id === out.stoicCover.entityId)
  )
    throw Error("stoicCover.entityId must name an entity.");
  if (JSON.stringify(out).length > MAX_NORMALIZED_BYTES)
    throw Error("Snapshot is too large after normalization.");
  return out;
}
function validateBurn(b) {
  const pairs = list(
    (b.topCategories ?? []).map((p) => ({ p })),
    "burn.topCategories",
  ).map(({ p }) => {
    if (!Array.isArray(p) || p.length !== 2)
      throw Error("burn.topCategories rows must be [name, amount].");
    return [text(p[0], "burn.topCategories.name", 120), number(p[1], "burn.topCategories.amount")];
  });
  // Accepts {name: date} or the normalized [[name, date]] form.
  const lastDates = Array.isArray(b.accountsLastDate)
    ? b.accountsLastDate.map((p) => {
        if (!Array.isArray(p) || p.length !== 2)
          throw Error("burn.accountsLastDate rows must be [name, date].");
        return p;
      })
    : Object.entries(object(b.accountsLastDate, "burn.accountsLastDate"));
  if (lastDates.length > MAX_ROWS) throw Error("burn.accountsLastDate exceeds rows.");
  const accounts = lastDates.map(([k, v]) => [
    text(k, "burn.accountsLastDate.key", 120),
    date(v, "burn.accountsLastDate.value"),
  ]);
  return {
    asOf: date(b.asOf, "burn.asOf"),
    dataThroughPartial: date(b.dataThroughPartial, "burn.dataThroughPartial"),
    t30dNetBurnCad: number(b.t30dNetBurnCad, "burn.t30dNetBurnCad"),
    vsYesterday: number(b.vsYesterday, "burn.vsYesterday"),
    vs30dAgo: number(b.vs30dAgo, "burn.vs30dAgo"),
    topCategories: pairs,
    accountsLastDate: accounts,
    definition: text(b.definition, "burn.definition", 1000),
    // Optional additions (older snapshots omit them): daily series and debt service.
    series: validateSeries(b.series),
    debtService: b.debtService == null ? null : validateDebtService(object(b.debtService, "burn.debtService")),
  };
}
const MAX_SERIES = 400;
function validateSeries(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error("burn.series must be a list.");
  if (value.length > MAX_SERIES) throw Error(`burn.series exceeds ${MAX_SERIES} points.`);
  return value
    .map((p) => {
      if (!Array.isArray(p) || p.length !== 2) throw Error("burn.series rows must be [date, amount].");
      return [date(p[0], "burn.series.date"), number(p[1], "burn.series.amount")];
    })
    .filter(([d, v]) => d && v !== null)
    .sort((a, b) => a[0].localeCompare(b[0]));
}
function validateDebtService(d) {
  return {
    start: date(d.start, "burn.debtService.start"),
    end: date(d.end, "burn.debtService.end"),
    interestCad: number(d.interestCad, "burn.debtService.interestCad"),
    principalCad: number(d.principalCad, "burn.debtService.principalCad"),
    feesCad: number(d.feesCad, "burn.debtService.feesCad"),
    totalCad: number(d.totalCad, "burn.debtService.totalCad"),
    note: text(d.note ?? "", "burn.debtService.note", 400),
  };
}

// Staleness, computed at render time against the clock (not the build).
export const STALE_INPUT_DAYS = 3;
export const STALE_SNAPSHOT_HOURS = 36;
// The savings rate is a monthly figure; its as-of is the end of the newest month on file.
export const STALE_SAVINGS_RATE_DAYS = 45;
export function freshness(s, nowMs = Date.now()) {
  const reasons = [];
  const gen = s.generatedAt ? Date.parse(s.generatedAt) : NaN;
  const ageHours = Number.isFinite(gen) ? (nowMs - gen) / 3600000 : null;
  if (ageHours === null) reasons.push("Snapshot build time is unknown.");
  else if (ageHours > STALE_SNAPSHOT_HOURS)
    reasons.push(`Snapshot built ${Math.floor(ageHours)} hours ago (limit ${STALE_SNAPSHOT_HOURS}).`);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const inputs = [
    ["Burn data", s.burn ? s.burn.asOf : undefined, STALE_INPUT_DAYS],
    ["Scorecard", s.scorecard ? s.scorecard.asOf : undefined, STALE_INPUT_DAYS],
    ["#cash feed post", s.feed?.lastPostDate, STALE_INPUT_DAYS],
    ["Savings rate", s.scorecard?.savingsRate ? s.scorecard.savingsRate.asOf : undefined, STALE_SAVINGS_RATE_DAYS],
  ];
  for (const [name, asOf, limit] of inputs) {
    if (asOf === undefined) continue; // section absent from this snapshot
    if (!asOf) reasons.push(`${name}: date unknown.`);
    else {
      const d = daysBetween(asOf, today);
      if (d > limit) reasons.push(`${name}: as of ${asOf}, ${d} days old (limit ${limit}).`);
    }
  }
  return { stale: reasons.length > 0, reasons, ageHours };
}
function validateScorecard(s) {
  const m = object(s.lastFullMonth, "scorecard.lastFullMonth");
  return {
    asOf: date(s.asOf, "scorecard.asOf"),
    lastFullMonth: {
      month: date(m.month, "scorecard.lastFullMonth.month", { month: true }),
      cad: number(m.cad, "scorecard.lastFullMonth.cad"),
      source: text(m.source, "scorecard.lastFullMonth.source", 200),
    },
    trend: text(s.trend, "scorecard.trend", 40),
    savingsPlanCadMo: number(s.savingsPlanCadMo, "scorecard.savingsPlanCadMo"),
    savingsBankedCadMo: number(
      s.savingsBankedCadMo,
      "scorecard.savingsBankedCadMo",
    ),
    corpMovedCount: number(s.corpMovedCount, "scorecard.corpMovedCount"),
    corpTotalCount: number(s.corpTotalCount, "scorecard.corpTotalCount"),
    corpMovedCadMo: number(s.corpMovedCadMo, "scorecard.corpMovedCadMo"),
    corpTotalCadMo: number(s.corpTotalCadMo, "scorecard.corpTotalCadMo"),
    // North Star (MoneyOS IDEAL-STATE §1): one definition, month and trailing 12 months.
    savingsRate:
      s.savingsRate == null
        ? null
        : validateSavingsRate(object(s.savingsRate, "scorecard.savingsRate")),
  };
}
function validateSavingsRate(r) {
  const f = "scorecard.savingsRate";
  return {
    month: date(r.month, `${f}.month`, { month: true }),
    monthRatePct: number(r.monthRatePct, `${f}.monthRatePct`),
    monthStatus: text(r.monthStatus, `${f}.monthStatus`, 200),
    t12Label: text(r.t12Label, `${f}.t12Label`, 80),
    t12RatePct: number(r.t12RatePct, `${f}.t12RatePct`),
    definition: text(r.definition, `${f}.definition`, 400),
    asOf: date(r.asOf, `${f}.asOf`),
    source: text(r.source, `${f}.source`, 200),
  };
}

// ---- MoneyOS record sections (issue #54). Every one is optional and nullable. ----
function validateBooks(b) {
  return {
    suspenseCad: number(b.suspenseCad, "books.suspenseCad"),
    trialBalanceCad: number(b.trialBalanceCad, "books.trialBalanceCad"),
    balanced: bool(b.balanced, "books.balanced"),
    tieOutsPassing: count(b.tieOutsPassing, "books.tieOutsPassing"),
    tieOutsFailing: count(b.tieOutsFailing, "books.tieOutsFailing"),
    // Rows whose status is neither "ties" nor "does not tie" (not tieable yet).
    tieOutsOther: count(b.tieOutsOther, "books.tieOutsOther"),
    asOf: date(b.asOf, "books.asOf"),
  };
}
export const MAX_PAYABLES = 30;
function validatePayables(value) {
  const rows = list(value, "payables");
  if (rows.length > MAX_PAYABLES) throw Error(`payables exceeds ${MAX_PAYABLES} rows.`);
  return rows.map((p, i) => {
    const f = `payables[${i}]`;
    return {
      id: text(p.id, `${f}.id`, 32) || `row-${i + 1}`,
      priority: count(p.priority, `${f}.priority`),
      type: oneOf(p.type, `${f}.type`, ["payable", "receivable"], "payable"),
      entity: text(p.entity, `${f}.entity`, 64),
      counterparty: text(p.counterparty, `${f}.counterparty`, 120),
      description: text(p.description, `${f}.description`, 240),
      amount: number(p.amount, `${f}.amount`),
      currency: p.currency == null || p.currency === "" ? "CAD" : currency(p.currency, `${f}.currency`),
      dueDate: date(p.dueDate, `${f}.dueDate`),
      // Free text the register holds instead of a date ("next statement", "on demand").
      dueNote: text(p.dueNote, `${f}.dueNote`, 40),
      status: text(p.status, `${f}.status`, 80),
      source: text(p.source, `${f}.source`, 200),
      lastChecked: date(p.lastChecked, `${f}.lastChecked`),
    };
  });
}
function validateClarify(c) {
  return {
    openToClarifyRows: count(c.openToClarifyRows, "clarify.openToClarifyRows"),
    openQuestions: count(c.openQuestions, "clarify.openQuestions"),
    batches: count(c.batches, "clarify.batches"),
    asOf: date(c.asOf, "clarify.asOf"),
  };
}
const MAX_AGENTS = 20;
function agentNames(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`${field} must be a list.`);
  if (value.length > MAX_AGENTS) throw Error(`${field} exceeds ${MAX_AGENTS} names.`);
  return value.map((n) => text(n, field, 40)).filter(Boolean);
}
function validateContract(c) {
  const hash = text(c.hash, "contract.hash", 64) || null;
  if (hash !== null && !/^[0-9a-f]{12}$/.test(hash))
    throw Error("contract.hash must be 12 lowercase hex characters or null.");
  return {
    version: text(c.version, "contract.version", 20),
    hash,
    date: date(c.date, "contract.date"),
    requiredAcks: agentNames(c.requiredAcks, "contract.requiredAcks"),
    ackedAgents: agentNames(c.ackedAgents, "contract.ackedAgents"),
    graceUntil: date(c.graceUntil, "contract.graceUntil"),
  };
}
function validateCabin(c) {
  return {
    lastStatementMonth: date(c.lastStatementMonth, "cabin.lastStatementMonth", { month: true }),
    nights: count(c.nights, "cabin.nights"),
    grossCad: number(c.grossCad, "cabin.grossCad"),
    salesTaxesCad: number(c.salesTaxesCad, "cabin.salesTaxesCad"),
    depositCad: number(c.depositCad, "cabin.depositCad"),
    netExTaxCad: number(c.netExTaxCad, "cabin.netExTaxCad"),
    statementsOnFile: count(c.statementsOnFile, "cabin.statementsOnFile"),
  };
}

export function readCash(value) {
  if (!value) return { state: "unconfigured", snapshot: emptyCash() };
  try {
    if (new TextEncoder().encode(value).length > MAX_JSON_BYTES)
      throw Error("Too large");
    return { state: "ready", snapshot: validateCash(JSON.parse(value)) };
  } catch {
    return { state: "invalid", snapshot: emptyCash() };
  }
}

// ---- Derivations (all per entity or per scope; nothing sums across entities) ----

// Cash of ONE entity in ONE currency. Unknown if any balance is unknown.
export function entityCash(entity, cur) {
  const rows = entity.balances.filter((b) => b.currency === cur);
  if (!rows.length) return { amount: null, asOf: null, accounts: 0 };
  let amount = 0,
    asOf = null;
  for (const b of rows) {
    if (b.amount === null) return { amount: null, asOf: null, accounts: rows.length };
    amount += b.amount;
    if (b.asOf && (!asOf || b.asOf < asOf)) asOf = b.asOf;
  }
  return { amount: round2(amount), asOf, accounts: rows.length };
}

export const round2 = (n) => Math.round(n * 100) / 100;

export function daysBetween(from, to) {
  if (!validDate(from) || !validDate(to)) return null;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

// Cover = entity CAD cash − open tax claims of that entity − planned funding.
// Any unknown input makes the cover unknown. Each input keeps its own date.
export function stoicCover(s) {
  const entity = s.entities.find((e) => e.id === s.stoicCover.entityId);
  const cash = entity ? entityCash(entity, "CAD") : { amount: null, asOf: null };
  const claims = s.taxItems.filter(
    (t) =>
      t.open &&
      (s.stoicCover.claimKeys.length
        ? s.stoicCover.claimKeys.includes(t.key)
        : t.entity === s.stoicCover.entityId),
  );
  let claimsCad = 0;
  for (const c of claims) {
    if (c.amountCad === null) {
      claimsCad = null;
      break;
    }
    claimsCad += c.amountCad;
  }
  if (!claims.length) claimsCad = s.stoicCover.entityId ? 0 : null;
  const plan = s.fundingPlan.totalCad;
  const cover =
    cash.amount === null || claimsCad === null || plan === null
      ? null
      : round2(cash.amount - claimsCad - plan);
  return {
    entity: entity?.label ?? null,
    cash: { amount: cash.amount, asOf: cash.asOf ?? s.stoicCover.cashAsOf },
    claims: { amount: claimsCad === null ? null : round2(claimsCad), asOf: s.stoicCover.claimsAsOf, items: claims },
    plan: { amount: plan, asOf: s.fundingPlan.asOf },
    cover,
  };
}

// Personal-scope debt roll-up: one scope, never across entities. Totals say how
// many facilities they cover; blended rate uses only rows with balance and rate.
export function debtTotals(debts) {
  let balance = 0,
    balanceRows = 0,
    interest = 0,
    interestRows = 0,
    weighted = 0,
    weightedBalance = 0,
    asOf = null;
  for (const d of debts) {
    if (d.balanceCad !== null) {
      balance += d.balanceCad;
      balanceRows++;
      if (d.balanceAsOf && (!asOf || d.balanceAsOf < asOf)) asOf = d.balanceAsOf;
      if (d.ratePct !== null) {
        weighted += d.balanceCad * d.ratePct;
        weightedBalance += d.balanceCad;
      }
    }
    if (d.interestMonthCad !== null) {
      interest += d.interestMonthCad;
      interestRows++;
    }
  }
  return {
    facilities: debts.length,
    balanceCad: balanceRows ? round2(balance) : null,
    balanceRows,
    interestMonthCad: interestRows ? round2(interest) : null,
    interestRows,
    blendedRatePct: weightedBalance ? round2(weighted / weightedBalance) : null,
    asOf,
  };
}

export function fundingRows(s, today) {
  return s.fundingTargets.map((t) => {
    const days = t.deadline ? daysBetween(today, t.deadline) : null;
    const remaining =
      t.targetCad === null || t.contributedCad === null
        ? null
        : round2(t.targetCad - t.contributedCad);
    let tag = t.status;
    if (t.status === "open" && days !== null && days < 0) tag = "overdue";
    else if (t.status === "open" && days !== null && days <= 60) tag = "due soon";
    else if (t.status === "open" && t.contributedCad === null) tag = "unverified";
    return { ...t, days, remaining, tag };
  });
}

// Alerts and the next seven days, computed from dated rows only.
export function alerts(s, today) {
  const out = [];
  const within = (d, n) => d && daysBetween(today, d) !== null && daysBetween(today, d) <= n;
  for (const t of s.tasks)
    if (!t.done && within(t.deadline, 7))
      out.push({
        when: t.deadline,
        days: daysBetween(today, t.deadline),
        who: t.who,
        text: t.title,
        kind: "task",
      });
  for (const t of s.taxItems) {
    if (!t.open) continue;
    if (t.kind === "notice")
      out.push({ when: t.asOf, days: null, who: "gui", text: t.text, kind: "tax notice" });
    else if (within(t.due, 7))
      out.push({ when: t.due, days: daysBetween(today, t.due), who: "gui", text: t.text, kind: "tax due" });
  }
  for (const u of s.upcomingCharges)
    if (within(u.date, 7))
      out.push({
        when: u.date,
        days: daysBetween(today, u.date),
        who: "gui",
        text: `${u.vendor}: ${u.action || "charge"}${u.amountCad === null ? "" : ` (CAD ${u.amountCad})`}`,
        kind: "charge",
      });
  if (s.burn?.asOf && daysBetween(s.burn.asOf, today) > 5)
    out.push({
      when: s.burn.asOf,
      days: null,
      who: "bot",
      text: `Burn series stuck at ${s.burn.asOf}: a connected account stopped syncing.`,
      kind: "data",
    });
  for (const e of s.entities)
    if (!e.balances.length)
      out.push({ when: null, days: null, who: "bot", text: `${e.label}: no balance on file. ${e.note}`.trim(), kind: "data" });
  return out.sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
}

// Payables and receivables with days to due date and a tag. A row whose status
// says it is parked, planned, estimated, recurring, already paid or missing is
// not actionable: its status is the tag and the date alone never makes it
// overdue or due soon. Order: overdue, due soon, the rest; then days; then priority.
export const PAYABLE_DUE_SOON_DAYS = 14;
const HELD_STATUS = /\b(parked|cancel planned|estimate[d]?|recurring|paid per [a-z]+|missing)\b/i;
export function payableRows(s, today) {
  const rank = { overdue: 0, "due soon": 1 };
  return [...s.payables]
    .map((p) => {
      const days = p.dueDate ? daysBetween(today, p.dueDate) : null;
      const held = HELD_STATUS.exec(p.status);
      let tag = "";
      if (held) tag = held[1].toLowerCase();
      else if ((days !== null && days < 0) || /overdue/i.test(p.dueNote)) tag = "overdue";
      else if (days !== null && days <= PAYABLE_DUE_SOON_DAYS) tag = "due soon";
      else if (/unconfirmed/i.test(p.status)) tag = "unverified";
      return { ...p, days, tag, actionable: !held, when: p.dueDate ?? (p.dueNote || null) };
    })
    .sort(
      (a, b) =>
        (rank[a.tag] ?? 2) - (rank[b.tag] ?? 2) ||
        (a.days ?? 9999) - (b.days ?? 9999) ||
        (a.priority ?? 999) - (b.priority ?? 999),
    );
}

// Contract acknowledgement status: who is missing at the current hash and whether grace has passed.
export function contractStatus(s, today) {
  const c = s.contract;
  if (!c) return { missing: [], afterGrace: false, overdue: false };
  const missing = c.requiredAcks.filter((a) => !c.ackedAgents.includes(a));
  const afterGrace = c.graceUntil ? daysBetween(c.graceUntil, today) > 0 : false;
  return { missing, afterGrace, overdue: missing.length > 0 && afterGrace };
}

export function openTasks(s) {
  return [...s.tasks]
    .filter((t) => !t.done)
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}
