"use client";
import { useEffect, useState } from "react";
import {
  freshness,
  pct,
  sourceStatus,
  taskQueue,
} from "@/lib/cash-model.mjs";
import type { CashSnapshot } from "@/lib/cash-types";
import s from "./cash.module.css";

const cad = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "n/a"
    : (n < 0 ? "-" : "") + "CA$" + Math.abs(Math.round(n)).toLocaleString("en-CA");
const signed = (n: number | null) =>
  n === null ? "n/a" : (n > 0 ? "+" : n < 0 ? "-" : "") + "CA$" + Math.abs(Math.round(n)).toLocaleString("en-CA");

function Chart({ series }: { series: { date: string; value: number }[] }) {
  if (series.length < 2) return <p className={s.muted}>Not enough daily history to draw a chart.</p>;
  const W = 720, H = 220, P = 28;
  const vals = series.map((p) => p.value);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const x = (i: number) => P + (i * (W - 2 * P)) / (series.length - 1);
  const y = (v: number) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo || 1);
  const d = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className={s.chart}
      aria-label={`Daily trailing-30-day net burn, ${series[0].date} to ${last.date}, latest ${cad(last.value)}`}>
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className={s.axis} />
      <path d={d} className={s.line} fill="none" />
      <circle cx={x(series.length - 1)} cy={y(last.value)} r="4" className={s.dot} />
      <text x={P} y={H - 6} className={s.tick}>{series[0].date}</text>
      <text x={W - P} y={H - 6} textAnchor="end" className={s.tick}>{last.date}</text>
      <text x={P} y={14} className={s.tick}>{cad(hi)}</text>
    </svg>
  );
}

export default function CashDashboard({
  snapshot, state, renderedAt,
}: { snapshot: CashSnapshot | null; state: string; renderedAt: number }) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!snapshot)
    return (
      <main className={s.page}>
        <h1>Cash</h1>
        <div className={s.banner} role="alert">
          <strong>{state === "invalid" ? "The cash snapshot could not be validated." : "No cash data yet."}</strong>
          <p>
            {state === "invalid"
              ? "Nothing was loaded. The refresh job must publish a new snapshot."
              : "The refresh job has not published a snapshot to this deployment yet."}
          </p>
        </div>
      </main>
    );
  const f = freshness(snapshot, now);
  const q = taskQueue(snapshot.tasks);
  const h = snapshot.headline;
  const move = pct(snapshot.corpMove.movedCount, snapshot.corpMove.totalCount);
  const banked = pct(snapshot.savings.bankedCadMo, snapshot.savings.planCadMo);
  return (
    <main className={s.page}>
      <h1>Cash</h1>
      <div className={f.stale ? s.asofStale : s.asof} role="status">
        <strong>As of {snapshot.asOf}</strong> · built {snapshot.generatedAt.replace("T", " ").slice(0, 16)} UTC
        {h.dataThrough ? ` · burn data through ${h.dataThrough}` : ""}
      </div>
      {f.stale && (
        <div className={s.banner} role="alert">
          <strong>Stale data. Do not rely on these numbers.</strong>
          <ul>{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      <section className={s.hero} aria-label="Trailing 30-day net burn">
        <p className={s.kicker}>T30D NET BURN (CAD)</p>
        <p className={s.big}>{cad(h.t30dNetBurnCad)}</p>
        <p className={s.deltas}>
          <span>vs yesterday {signed(h.vsYesterdayCad)}</span>
          <span>vs 30 days ago {signed(h.vs30dAgoCad)}</span>
        </p>
        <p className={s.muted}>Positive means burning cash. Down is better.</p>
        <Chart series={snapshot.series} />
        {h.definition && <p className={s.muted}>{h.definition}</p>}
      </section>
      <section className={s.panel}>
        <h2>Today&apos;s one action</h2>
        {snapshot.action ? (
          <>
            <p className={s.action}>{snapshot.action.title}</p>
            {snapshot.action.why && <p>{snapshot.action.why}</p>}
            {snapshot.action.where && <p className={s.muted}>{snapshot.action.where}</p>}
          </>
        ) : <p>Nothing needs you today.</p>}
      </section>
      <div className={s.grid}>
        <section className={s.panel}>
          <h2>Savings banked</h2>
          <p className={s.mid}>{cad(snapshot.savings.bankedCadMo)}/mo of {cad(snapshot.savings.planCadMo)}/mo plan ({banked}%)</p>
          {snapshot.savings.outsidePlan.map((o) => (
            <p key={o.item} className={s.muted}>Outside plan: {o.item} {cad(o.cadMo)}/mo{o.effective ? `, from ${o.effective}` : ""}</p>
          ))}
        </section>
        <section className={s.panel}>
          <h2>Moved to Ensemble Wise</h2>
          <p className={s.mid}>{move}% ({snapshot.corpMove.movedCount} of {snapshot.corpMove.totalCount} payments)</p>
          <p className={s.muted}>{cad(snapshot.corpMove.movedCadMo)} of {cad(snapshot.corpMove.totalCadMo)} per month</p>
          {snapshot.corpMove.note && <p className={s.muted}>{snapshot.corpMove.note}</p>}
        </section>
        <section className={s.panel}>
          <h2>Gui task queue</h2>
          {q.today ? <p className={s.mid}>Today: {q.today.title}</p> : <p className={s.mid}>Queue is clear.</p>}
          <p className={s.muted}>{q.remaining} more after this · {q.done} done</p>
        </section>
      </div>
      <section className={s.panel}>
        <h2>Monthly interest (not principal)</h2>
        {snapshot.interest.length === 0 ? <p className={s.muted}>No interest data.</p> : (
          <table className={s.table}><thead><tr><th>Debt</th><th>Scope</th><th>Avg per month</th></tr></thead>
            <tbody>{snapshot.interest.map((i) => (
              <tr key={i.name}><td>{i.name}</td><td>{i.scope}</td><td>{cad(i.avgMonthCad)}</td></tr>
            ))}</tbody></table>
        )}
      </section>
      <section className={s.panel}>
        <h2>Data freshness</h2>
        <table className={s.table}><thead><tr><th>Source</th><th>Data through</th><th>Status</th><th>Note</th></tr></thead>
          <tbody>{snapshot.sources.map((v) => {
            const st = sourceStatus(v, now);
            return (
              <tr key={v.id}><td>{v.name}</td><td>{v.asOf || "unknown"}</td>
                <td className={st === "current" ? s.ok : s.bad}>{st}</td><td>{v.note}</td></tr>
            );
          })}</tbody></table>
      </section>
    </main>
  );
}
