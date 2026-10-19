// Pure, shared parsing and freshness logic for the Cash page. No private data lives here.
// Contract: docs/finance/schema/cash.schema.json and docs/finance/README.md.
export const STALE_INPUT_DAYS = 3;
export const STALE_SNAPSHOT_HOURS = 36;
const DAY = 86400000;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const date = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v + "T00:00:00Z"))
    ? v
    : "";
const stamp = (v) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : "";
const list = (v, max, fn) =>
  Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : [];

export function emptyCash() {
  return null;
}

// Defensive: returns a normalized snapshot or null. Never throws.
export function validateCash(raw) {
  try {
    if (!isObj(raw) || raw.schemaVersion !== 1) return null;
    const h = isObj(raw.headline) ? raw.headline : {};
    const generatedAt = stamp(raw.generatedAt);
    const asOf = date(raw.asOf);
    const t30d = num(h.t30dNetBurnCad);
    if (!generatedAt || !asOf || t30d === null) return null;
    const sv = isObj(raw.savings) ? raw.savings : {};
    const cm = isObj(raw.corpMove) ? raw.corpMove : {};
    const a = isObj(raw.action) ? raw.action : null;
    return {
      schemaVersion: 1,
      generatedAt,
      asOf,
      headline: {
        t30dNetBurnCad: t30d,
        vsYesterdayCad: num(h.vsYesterdayCad),
        vs30dAgoCad: num(h.vs30dAgoCad),
        dataThrough: date(h.dataThrough),
        definition: str(h.definition, 1000),
      },
      series: list(raw.series, 800, (p) =>
        isObj(p) && date(p.date) && num(p.value) !== null
          ? { date: p.date, value: p.value }
          : null,
      ).sort((x, y) => (x.date < y.date ? -1 : 1)),
      action: a && str(a.title)
        ? { title: str(a.title), why: str(a.why, 800), where: str(a.where, 400) }
        : null,
      savings: {
        bankedCadMo: num(sv.bankedCadMo) ?? 0,
        planCadMo: num(sv.planCadMo) ?? 0,
        outsidePlan: list(sv.outsidePlan, 50, (o) =>
          isObj(o) && str(o.item)
            ? { item: str(o.item, 120), cadMo: num(o.cadMo) ?? 0, effective: date(o.effective) }
            : null,
        ),
      },
      corpMove: {
        movedCount: num(cm.movedCount) ?? 0,
        totalCount: num(cm.totalCount) ?? 0,
        movedCadMo: num(cm.movedCadMo) ?? 0,
        totalCadMo: num(cm.totalCadMo) ?? 0,
        note: str(cm.note, 400),
      },
      tasks: list(raw.tasks, 200, (t) =>
        isObj(t) && str(t.id) && str(t.title)
          ? {
              id: str(t.id, 80),
              title: str(t.title, 200),
              who: t.who === "bot" ? "bot" : "gui",
              deadline: date(t.deadline),
              done: date(t.done),
              burnCadMo: num(t.burnCadMo) ?? 0,
            }
          : null,
      ),
      interest: list(raw.interest, 100, (i) =>
        isObj(i) && str(i.name)
          ? {
              name: str(i.name, 160),
              scope: str(i.scope, 40),
              kind: str(i.kind, 40),
              avgMonthCad: num(i.avgMonthCad),
              note: str(i.note, 300),
            }
          : null,
      ),
      sources: list(raw.sources, 100, (v) =>
        isObj(v) && str(v.name)
          ? {
              id: str(v.id, 80) || str(v.name, 80),
              name: str(v.name, 160),
              asOf: date(v.asOf),
              checkedAt: stamp(v.checkedAt),
              note: str(v.note, 300),
            }
          : null,
      ),
    };
  } catch {
    return null;
  }
}

// Transport: JSON in CASH_SNAPSHOT_JSON, or gzip+base64 in CASH_SNAPSHOT_GZIP_BASE64.
// A present compressed value takes precedence and never falls back to JSON.
// The decoder (node:zlib) is injected by lib/cash-snapshot.mjs to keep this file pure.
export function readCashText(text) {
  if (typeof text !== "string" || !text.trim()) return { state: "missing", snapshot: null };
  try {
    const snapshot = validateCash(JSON.parse(text));
    return snapshot ? { state: "ready", snapshot } : { state: "invalid", snapshot: null };
  } catch {
    return { state: "invalid", snapshot: null };
  }
}

const daysBetween = (nowMs, isoDate) =>
  Math.floor((nowMs - Date.parse(isoDate + "T00:00:00Z")) / DAY);

// Staleness is computed against the clock at render, so a dead refresh job shows itself.
export function freshness(snapshot, nowMs = Date.now()) {
  if (!snapshot) return { stale: true, reasons: ["No data snapshot is loaded."], ageHours: null };
  const reasons = [];
  const ageHours = (nowMs - Date.parse(snapshot.generatedAt)) / 3600000;
  if (ageHours > STALE_SNAPSHOT_HOURS)
    reasons.push(
      `Snapshot was built ${Math.floor(ageHours)} hours ago (limit ${STALE_SNAPSHOT_HOURS}).`,
    );
  const inputs = snapshot.sources.map((v) => ({ name: v.name, asOf: v.asOf }));
  if (snapshot.headline.dataThrough)
    inputs.push({ name: "Burn series", asOf: snapshot.headline.dataThrough });
  for (const v of inputs) {
    if (!v.asOf) reasons.push(`${v.name}: data date unknown.`);
    else {
      const d = daysBetween(nowMs, v.asOf);
      if (d > STALE_INPUT_DAYS)
        reasons.push(`${v.name}: data through ${v.asOf}, ${d} days old (limit ${STALE_INPUT_DAYS}).`);
    }
  }
  return { stale: reasons.length > 0, reasons, ageHours };
}

export function sourceStatus(v, nowMs = Date.now()) {
  if (!v.asOf) return "unknown";
  return daysBetween(nowMs, v.asOf) > STALE_INPUT_DAYS ? "stale" : "current";
}

export function taskQueue(tasks) {
  const open = tasks
    .filter((t) => t.who === "gui" && !t.done)
    .sort((a, b) => (a.deadline || "9999") < (b.deadline || "9999") ? -1 : 1);
  return { today: open[0] ?? null, remaining: Math.max(open.length - 1, 0), done: tasks.filter((t) => t.done).length };
}

export const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
