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
  };
  unique(out.entities, "entity");
  unique(out.fundingTargets, "funding target");
  unique(out.tasks, "task");
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
  };
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

export function openTasks(s) {
  return [...s.tasks]
    .filter((t) => !t.done)
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}
