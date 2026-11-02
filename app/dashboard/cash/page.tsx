import { redirect } from "next/navigation";
import { getCashData } from "@/lib/cash-data";
import {
  alerts,
  contractStatus,
  debtTotals,
  freshness,
  fundingRows,
  openTasks,
  payableRows,
  stoicCover,
} from "@/lib/cash-model.mjs";
import { useMDXComponents } from "nextra-theme-docs";
import s from "./cash.module.css";

const { wrapper: Wrapper } = useMDXComponents();
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Cash",
  robots: { index: false, follow: false },
};
const pageMetadata = {
  title: "Cash",
  filePath: "app/dashboard/cash/page.tsx",
  searchable: false,
};
const OWNER_LINE =
  "Owner: Chief of Cash (GrokBot) · feed in #cash · record of truth: main of the private MoneyOS repository (contract SOURCE_OF_TRUTH.md)";
const SAVINGS_TARGET_PCT = 20;

type Unknown = number | null;
const fmt0 = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("en-CA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// Whole amounts stay whole; anything with cents shows both digits.
const fmt = { format: (n: number) => (Number.isInteger(n) ? fmt0 : fmt2).format(n) };
// "unknown" is styled in one place.
function Unknown({ what = "unknown" }: { what?: string }) {
  return <span className={s.unknown}>{what}</span>;
}
function Money({
  amount,
  currency = "CAD",
  signed = false,
}: {
  amount: Unknown;
  currency?: string;
  signed?: boolean;
}) {
  if (amount === null || amount === undefined) return <Unknown />;
  const sign = signed && amount > 0 ? "+" : "";
  return <>{`${currency} ${sign}${fmt.format(amount)}`}</>;
}
function Pct({ value }: { value: Unknown }) {
  return value === null ? <Unknown /> : <>{`${fmt.format(value)}%`}</>;
}
function AsOf({ date, prefix = "as of" }: { date: string | null; prefix?: string }) {
  return (
    <small>
      {prefix} {date ?? <Unknown what="unknown date" />}
    </small>
  );
}
function Tag({ tag }: { tag: string }) {
  const cls =
    tag === "overdue"
      ? s.tagBad
      : tag === "due soon" || tag === "unverified" || tag === "blocked" || tag === "below target" || tag === "missing"
        ? s.tagWarn
        : tag === "funded" || tag === "done" || tag === "on target"
          ? s.tagOk
          : "";
  return <span className={`${s.tag} ${cls}`}>{tag}</span>;
}
function Count({ value }: { value: Unknown }) {
  return value === null ? <Unknown /> : <>{fmt0.format(value)}</>;
}
function Chart({ series }: { series: [string, number][] }) {
  if (series.length < 2) return null;
  const W = 720, H = 180, P = 24;
  const vals = series.map((p) => p[1]);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const x = (i: number) => P + (i * (W - 2 * P)) / (series.length - 1);
  const y = (v: number) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo || 1);
  const d = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const [first, last] = [series[0], series[series.length - 1]];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img"
      aria-label={`Daily T30D net burn from ${first[0]} to ${last[0]}; latest CAD ${fmt.format(last[1])}`}>
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className={s.axis} />
      <path d={d} fill="none" className={s.line} />
      <circle cx={x(series.length - 1)} cy={y(last[1])} r="4" className={s.dot} />
      <text x={P} y={H - 6} className={s.tick}>{first[0]}</text>
      <text x={W - P} y={H - 6} textAnchor="end" className={s.tick}>{last[0]}</text>
      <text x={P} y={12} className={s.tick}>{`CAD ${fmt.format(hi)}`}</text>
    </svg>
  );
}
function pct(n: Unknown, d: Unknown): Unknown {
  return n === null || d === null || !d ? null : Math.round((n / d) * 100);
}
function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

export default async function CashPage() {
  const data = await getCashData();
  if (!data) redirect("/api/auth/signin?callbackUrl=%2Fdashboard%2Fcash");
  const snap = data.snapshot;
  const asOfToday = today();
  const ready = data.state === "ready";
  const cover = stoicCover(snap);
  const debt = debtTotals(snap.debts);
  const funding = fundingRows(snap, asOfToday);
  const alertRows = alerts(snap, asOfToday);
  const tasks = openTasks(snap);
  const burn = snap.burn;
  const fresh = freshness(snap, Date.now());
  const sc = snap.scorecard;
  const sr = sc?.savingsRate ?? null;
  const books = snap.books;
  const pay = payableRows(snap, asOfToday);
  const clarify = snap.clarify;
  const contract = snap.contract;
  const ack = contractStatus(snap, asOfToday);
  const cabin = snap.cabin;
  const guiTasks = tasks.filter((t) => t.who === "gui");
  const todayTask = guiTasks[0] ?? null;
  // Only what leads to an action or decision soon: due within 7 days or late, open
  // notices, blocked funding, a short Stoic cover, overdue or imminent payables,
  // and a contract acknowledgement missing after grace.
  const soon = [
    ...alertRows.filter((a) => a.kind !== "data" && (a.days === null || a.days <= 7)),
    ...funding
      .filter((f) => f.tag === "blocked" || f.tag === "overdue")
      .map((f) => ({ when: f.deadline, days: f.days, who: "gui", text: `${f.label}: ${f.statusNote || f.tag}`, kind: `funding ${f.tag}` })),
    ...(cover.cover !== null && cover.cover < 0
      ? [{ when: null, days: null, who: "gui", text: `${cover.entity ?? "Funding entity"} cover after tax and funding is short: CAD ${fmt.format(cover.cover)}`, kind: "decision" }]
      : []),
    ...pay
      .filter((p) => p.actionable && (p.tag === "overdue" || (p.days !== null && p.days <= 7)))
      .map((p) => ({
        when: p.when,
        days: p.days,
        who: "gui",
        text: `${p.counterparty || p.description}${p.amount === null ? "" : `: ${p.currency} ${fmt.format(p.amount)}`}${p.dueNote ? ` (${p.dueNote})` : ""}`,
        kind: p.type,
      })),
    ...(ack.overdue && contract
      ? [{ when: contract.graceUntil, days: null, who: "bot", text: `Contract acknowledgement missing after grace: ${ack.missing.join(", ")}`, kind: "contract" }]
      : []),
  ];
  return (
    <Wrapper toc={[]} metadata={pageMetadata} sourceCode="">
      <div className={s.dashboard} data-pagefind-ignore="all">
        <header className={s.head}>
          <div className={s.crumb}>
            <a href="/dashboard">Dashboard</a> / Cash · <a href="/dashboard/invest">Invest ↗</a>
          </div>
          <div className={s.eyebrow}>SUPER AGENTS / FINANCE / CASH</div>
          <h1>Cash</h1>
          <div className={s.statusbar}>
            <span className={`${s.verdict} ${ready && !fresh.stale ? "" : s.attn}`}>
              <span className={s.vdot} />
              {!ready ? "No data" : fresh.stale ? "Data stale" : "Data current"}
            </span>
            {ready && (
              <span className={s.sep}>
                {soon.length} {soon.length === 1 ? "item needs" : "items need"} you in the next 7 days
              </span>
            )}
          </div>
          <details className={s.asof}>
            <summary>
              As of {burn?.asOf ?? "unknown"} · snapshot built {snap.generatedAt ?? "unknown"}
            </summary>
            <div className={s.meta}>
              <span>{OWNER_LINE}</span>
              <span>
                Feed last posted {snap.feed.lastPostDate ?? "unknown"} · month closed{" "}
                {snap.feed.monthlyClosed ?? "unknown"} · rendered {asOfToday}
              </span>
              <span>
                Every figure carries its own as-of date. Entities are never added together.
                Unknown renders as unknown, never as zero.
              </span>
            </div>
          </details>
        </header>
        {ready && fresh.stale && (
          <div className={s.staleBanner} role="alert">
            <strong>Stale data. Do not rely on these numbers.</strong>
            <ul>
              {fresh.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {!ready ? (
          <section className={s.panel}>
            <h2>
              {data.state === "invalid"
                ? "Cash snapshot needs attention"
                : "Cash snapshot is not connected yet"}
            </h2>
            <p>
              {data.state === "invalid"
                ? "The CASH_SNAPSHOT value failed validation. No partial or unvalidated records are displayed."
                : "Set CASH_SNAPSHOT_JSON (or CASH_SNAPSHOT_GZIP_BASE64) from scripts/build-cash-snapshot.mjs to render balances, alerts, funding progress, Stoic cover, debt and the task list."}
            </p>
            <p>No balance, due date or progress has been assumed. Unknown stays unknown.</p>
          </section>
        ) : (
          <>
            <section className={s.band} aria-label="Trailing 30-day net burn">
              <div className={s.eyebrow}>30-DAY NET BURN</div>
              {burn ? (
                <div className={s.heroFig}>
                  <div className={s.fig}>
                    <span className={s.cur}>CAD</span>
                    {burn.t30dNetBurnCad === null ? (
                      <span className={s.unknown}>unknown</span>
                    ) : (
                      fmt.format(burn.t30dNetBurnCad)
                    )}
                  </div>
                  <div className={s.note}>
                    <div className={s.deltas}>
                      <span>
                        vs yesterday <Money amount={burn.vsYesterday} signed />
                      </span>
                      <span>
                        vs 30 days ago <Money amount={burn.vs30dAgo} signed />
                      </span>
                    </div>
                    Positive means cash going out. Down is better. Data through{" "}
                    {burn.asOf ?? "unknown"}.
                  </div>
                </div>
              ) : (
                <p className={s.empty}>
                  Burn: <span className={s.unknown}>unknown</span> (no trailing-30-day series in the snapshot).
                </p>
              )}
            </section>

            <section className={s.band} aria-label="Savings rate">
              <div className={s.bandHead}>
                <h2>Savings rate</h2>
                <span className={s.right}>North Star · target {SAVINGS_TARGET_PCT}%+ · month and trailing 12 months</span>
              </div>
              {sr ? (
                <>
                  <div className={s.statGrid}>
                    <div className={s.stat}>
                      <span>Month {sr.month ?? "unknown"}</span>
                      <strong>
                        <Pct value={sr.monthRatePct} />
                      </strong>
                      <small>
                        {sr.monthRatePct !== null && (
                          <>
                            <Tag tag={sr.monthRatePct >= SAVINGS_TARGET_PCT ? "on target" : "below target"} />{" "}
                          </>
                        )}
                        {sr.monthStatus || "final"} · as of {sr.asOf ?? "unknown"}
                      </small>
                    </div>
                    <div className={s.stat}>
                      <span>{sr.t12Label || "Trailing 12 months"}</span>
                      <strong>
                        <Pct value={sr.t12RatePct} />
                      </strong>
                      <small>
                        {sr.t12RatePct !== null && (
                          <>
                            <Tag tag={sr.t12RatePct >= SAVINGS_TARGET_PCT ? "on target" : "below target"} />{" "}
                          </>
                        )}
                        trailing twelve months · {sr.source || "no source"}
                      </small>
                    </div>
                  </div>
                  <p className={s.muted}>Definition: {sr.definition || "unknown"}</p>
                </>
              ) : (
                <p className={s.empty}>
                  Savings rate: <Unknown /> (no savings-rate series in the snapshot).
                </p>
              )}
            </section>

            <section className={s.band} aria-label="Today's one task">
              <div className={s.eyebrow}>TODAY&apos;S ONE TASK</div>
              {todayTask ? (
                <div className={s.task}>
                  <div className={s.taskTitle}>{todayTask.title}</div>
                  <div className={s.taskMeta}>
                    {todayTask.deadline ? `due ${todayTask.deadline}` : "no deadline"}
                    {todayTask.burnCadMo ? <> · saves <Money amount={todayTask.burnCadMo} />/mo</> : null}
                    {" · "}
                    {Math.max(guiTasks.length - 1, 0)} more queued after this
                  </div>
                  {todayTask.why && <p className={s.taskWhy}>{todayTask.why}</p>}
                </div>
              ) : (
                <p className={s.empty}>Nothing needs you today.</p>
              )}
            </section>

            <section className={s.band} aria-label="Burn trend">
              <div className={s.bandHead}>
                <h2>Trend</h2>
                <span className={s.right}>daily T30D net burn, CAD</span>
              </div>
              {burn && burn.series.length > 1 ? (
                <Chart series={burn.series} />
              ) : (
                <p className={s.empty}>No daily series in the snapshot yet.</p>
              )}
            </section>

            <section className={s.band} aria-label="Needs you soon">
              <div className={s.bandHead}>
                <h2>Needs you soon</h2>
                <span className={s.right}>due within 7 days, overdue, or blocked</span>
              </div>
              {soon.length === 0 ? (
                <p className={s.empty}>Nothing due in the next seven days.</p>
              ) : (
                <ul className={s.due}>
                  {soon.map((a, i) => (
                    <li key={i} className={a.days !== null && a.days <= 0 ? s.now : s.soon}>
                      <span className={s.stripe} />
                      <span className={s.when}>
                        {a.days === null ? a.when ?? "open" : a.days < 0 ? `${-a.days}d late` : a.days === 0 ? "today" : `in ${a.days}d`}
                      </span>
                      <span className={s.what}>
                        {a.text} <small>· {a.kind}</small>
                      </span>
                      <span className={s.who}>
                        <Tag tag={a.who} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={s.band} aria-label="Books">
              <div className={s.bandHead}>
                <h2>Books</h2>
                <span className={s.right}>trial balance and statement tie-outs</span>
              </div>
              {books ? (
                <div className={s.statGrid}>
                  <div className={s.stat}>
                    <span>Suspense</span>
                    <strong>
                      <Money amount={books.suspenseCad} />
                    </strong>
                    <small>unmatched transfers · target under CAD 1,000, itemized</small>
                  </div>
                  <div className={s.stat}>
                    <span>Tie-outs</span>
                    <strong>
                      {books.tieOutsPassing === null || books.tieOutsFailing === null ? (
                        <Unknown />
                      ) : (
                        `${fmt0.format(books.tieOutsPassing)} / ${fmt0.format(books.tieOutsPassing + books.tieOutsFailing)} tieable`
                      )}
                    </strong>
                    <small>
                      {[
                        `${books.tieOutsPassing === null ? "unknown" : fmt0.format(books.tieOutsPassing)} tie`,
                        `${books.tieOutsFailing === null ? "unknown" : fmt0.format(books.tieOutsFailing)} do not`,
                        `${books.tieOutsOther === null ? "unknown" : fmt0.format(books.tieOutsOther)} not tied`,
                      ].join(" / ")}
                      {` · as of ${books.asOf ?? "unknown"}`}
                    </small>
                  </div>
                  <div className={s.stat}>
                    <span>Trial balance</span>
                    <strong>
                      {books.balanced === null ? <Unknown /> : books.balanced ? "balanced" : "out of balance"}
                    </strong>
                    <small>
                      {/* A residual: cents matter, so it always shows two decimals. */}
                      {books.trialBalanceCad === null ? "debits − credits unknown" : `debits − credits CAD ${fmt2.format(books.trialBalanceCad)}`}
                    </small>
                  </div>
                </div>
              ) : (
                <p className={s.empty}>
                  Books: <Unknown /> (no trial balance or tie-out file in the snapshot).
                </p>
              )}
            </section>

            <section className={s.band} aria-label="Payables and receivables">
              <div className={s.bandHead}>
                <h2>Payables and receivables</h2>
                <span className={s.right}>open rows of the register · overdue first</span>
              </div>
              {pay.length === 0 ? (
                <p className={s.empty}>No open payable or receivable in the snapshot.</p>
              ) : (
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Due</th>
                        <th>Counterparty</th>
                        <th>Entity</th>
                        <th className={s.num}>Amount</th>
                        <th>Status</th>
                        <th>Checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pay.map((p) => (
                        <tr key={p.id}>
                          <td className={s.nowrap}>
                            {p.when ?? <Unknown />}
                            {p.days !== null && (
                              <>
                                <br />
                                <small>{p.days < 0 ? `${-p.days}d overdue` : p.days === 0 ? "today" : `in ${p.days}d`}</small>
                              </>
                            )}
                            {p.tag && (
                              <>
                                <br />
                                <Tag tag={p.tag} />
                              </>
                            )}
                          </td>
                          <td>
                            {p.counterparty || <Unknown />} <Tag tag={p.type} />
                            {p.description && (
                              <>
                                <br />
                                <small>{p.description}</small>
                              </>
                            )}
                          </td>
                          <td>{p.entity || "unknown"}</td>
                          <td className={s.num}>
                            <Money amount={p.amount} currency={p.currency} />
                          </td>
                          <td>
                            {p.status || "unknown"}
                            {p.source && (
                              <>
                                <br />
                                <small>{p.source}</small>
                              </>
                            )}
                          </td>
                          <td className={s.nowrap}>{p.lastChecked ?? <Unknown />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={s.band} aria-label="Open items">
              <div className={s.bandHead}>
                <h2>Open items</h2>
                <span className={s.right}>rows awaiting a ruling and questions for you</span>
              </div>
              {clarify ? (
                <div className={s.statGrid}>
                  <div className={s.stat}>
                    <span>To clarify</span>
                    <strong>
                      <Count value={clarify.openToClarifyRows} />
                    </strong>
                    <small>
                      open rows in {clarify.batches === null ? "an unknown number of" : fmt0.format(clarify.batches)} batches · target under 20
                    </small>
                  </div>
                  <div className={s.stat}>
                    <span>Open questions</span>
                    <strong>
                      <Count value={clarify.openQuestions} />
                    </strong>
                    <small>yes/no questions waiting for your answer in the sheet</small>
                  </div>
                  <div className={s.stat}>
                    <span>As of</span>
                    <strong>{clarify.asOf ?? <Unknown />}</strong>
                    <small>newest row awaiting a ruling</small>
                  </div>
                </div>
              ) : (
                <p className={s.empty}>
                  Open items: <Unknown /> (no clarify files in the snapshot).
                </p>
              )}
            </section>

            <section className={s.band} aria-label="Contract">
              <div className={s.bandHead}>
                <h2>Contract</h2>
                <span className={s.right}>SOURCE_OF_TRUTH.md + sources.json, acknowledged in ACK.md</span>
              </div>
              {contract ? (
                <>
                  {ack.overdue && (
                    <div className={s.staleBanner} role="alert">
                      <strong>{`Acknowledgement missing after grace (${contract.graceUntil ?? "unknown date"}): ${ack.missing.join(", ")}.`}</strong>{" "}
                      check_sot.py fails for every agent until the row is added.
                    </div>
                  )}
                  <div className={s.statGrid}>
                    <div className={s.stat}>
                      <span>Version</span>
                      <strong>{contract.version || <Unknown />}</strong>
                      <small>dated {contract.date ?? "unknown"}</small>
                    </div>
                    <div className={s.stat}>
                      <span>Hash</span>
                      <strong>{contract.hash ?? <Unknown />}</strong>
                      <small>sha256 of the contract files, first 12 hex</small>
                    </div>
                    <div className={s.stat}>
                      <span>Acknowledged</span>
                      <strong>{`${contract.requiredAcks.length - ack.missing.length} of ${contract.requiredAcks.length}`}</strong>
                      <small>
                        {contract.requiredAcks.map((agent) => {
                          const acked = !ack.missing.includes(agent);
                          return (
                            <span key={agent} className={`${s.tag} ${acked ? s.tagOk : ack.afterGrace ? s.tagBad : s.tagWarn}`} style={{ marginRight: 4 }}>
                              {`${agent}: ${acked ? "acked" : "missing"}`}
                            </span>
                          );
                        })}
                        {` · grace until ${contract.graceUntil ?? "unknown"}`}
                      </small>
                    </div>
                  </div>
                </>
              ) : (
                <p className={s.empty}>
                  Contract: <Unknown /> (no sources.json in the snapshot).
                </p>
              )}
            </section>

            <section className={s.band} aria-label="Cabin">
              <div className={s.bandHead}>
                <h2>Cabin</h2>
                <span className={s.right}>
                  {`last owner statement · ${cabin?.statementsOnFile == null ? "unknown" : fmt0.format(cabin.statementsOnFile)} on file`}
                </span>
              </div>
              {cabin ? (
                <div className={s.statGrid}>
                  <div className={s.stat}>
                    <span>Statement {cabin.lastStatementMonth ?? "unknown"}</span>
                    <strong>{cabin.nights === null ? <Unknown /> : `${fmt0.format(cabin.nights)} nights`}</strong>
                    <small>gross <Money amount={cabin.grossCad} /></small>
                  </div>
                  <div className={s.stat}>
                    <span>Sales taxes collected</span>
                    <strong>
                      <Money amount={cabin.salesTaxesCad} />
                    </strong>
                    <small>deposit <Money amount={cabin.depositCad} /></small>
                  </div>
                  <div className={s.stat}>
                    <span>Net ex tax</span>
                    <strong>
                      <Money amount={cabin.netExTaxCad} />
                    </strong>
                    <small>after platform fees, commission and extras</small>
                  </div>
                </div>
              ) : (
                <p className={s.empty}>
                  Cabin: <Unknown /> (no owner statements in the snapshot).
                </p>
              )}
            </section>

            <h2 className={s.moreHead}>More detail</h2>

            <details id="entities" className={s.fold}>
              <summary>
                <span className={s.sectionLabel}>01 / ENTITIES AND BALANCES</span>
                <span className={s.foldTitle}>Where the cash sits</span>
              </summary>
              <p className={s.muted}>
                FX reference {snap.fx.usdcad === null ? "unknown" : `USD/CAD ${snap.fx.usdcad}`}{" "}
                ({snap.fx.source || "no source"}) <AsOf date={snap.fx.asOf} />. Shown for
                context only; USD balances are not converted.
              </p>
              <div className={s.entityGrid}>
                {snap.entities.map((e) => (
                  <article className={s.entity} key={e.id}>
                    <h3>
                      {e.label}
                      <span className={s.tag}>{e.balances.length} accounts</span>
                    </h3>
                    {e.balances.length === 0 && (
                      <p className={s.empty}>
                        <span className={s.unknown}>unknown</span> · {e.note || "no balance on file"}
                      </p>
                    )}
                    {e.balances.map((b, i) => (
                      <div className={s.balance} key={i}>
                        <span>{b.account}</span>
                        <strong>
                          <Money amount={b.amount} currency={b.currency} />
                        </strong>
                        <small>
                          {b.source || "no source"} · as of {b.asOf ?? "unknown date"}
                        </small>
                      </div>
                    ))}
                    {e.balances.length > 0 && e.note && <small>{e.note}</small>}
                  </article>
                ))}
                {snap.credit.map((c, i) => (
                  <article className={s.entity} key={`credit-${i}`}>
                    <h3>
                      Credit drawn · {c.entity}
                      <span className={s.tag}>line</span>
                    </h3>
                    <div className={s.balance}>
                      <span>{c.account}</span>
                      <strong>
                        <Money amount={c.drawn} currency={c.currency} />
                      </strong>
                      <small>
                        of limit <Money amount={c.limit} currency={c.currency} /> ·{" "}
                        {c.source || "no source"} · as of {c.asOf ?? "unknown date"}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            </details>

            <details id="alerts" className={s.fold}>
              <summary>
                <span className={s.sectionLabel}>02 / ALERTS AND NEXT 7 DAYS</span>
                <span className={s.foldTitle}>What needs a hand this week</span>
              </summary>
              <p className={s.muted}>
                Open tasks and tax items due within seven days of {asOfToday}, open
                notices, upcoming charges and data gaps. "gui" needs your login or
                payment; "bot" is the Chief of Cash.
              </p>
              {alertRows.length === 0 ? (
                <p className={s.empty}>Nothing due in the next seven days.</p>
              ) : (
                <div>
                  {alertRows.map((a, i) => (
                    <div className={s.alert} key={i}>
                      <span>
                        {a.when ?? "undated"}
                        {a.days !== null && (
                          <>
                            <br />
                            <small>
                              {a.days < 0
                                ? `${-a.days}d overdue`
                                : a.days === 0
                                  ? "today"
                                  : `in ${a.days}d`}
                            </small>
                          </>
                        )}
                      </span>
                      <span>
                        <Tag tag={a.who} />
                      </span>
                      <span>
                        {a.text} <small>· {a.kind}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <h3 style={{ marginTop: 22 }}>Tax items on file</h3>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Entity</th>
                      <th>Item</th>
                      <th>Due</th>
                      <th className={s.num}>CAD</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.taxItems.map((t) => (
                      <tr key={t.key}>
                        <td>{t.entity}</td>
                        <td>
                          {t.text} {!t.open && <Tag tag="closed" />}
                        </td>
                        <td>{t.due ?? (t.kind === "notice" ? "open" : "unknown")}</td>
                        <td className={s.num}>
                          <Money amount={t.amountCad} />
                          {t.amountBasis && t.amountBasis !== "stated" && (
                            <>
                              <br />
                              <small>{t.amountBasis}</small>
                            </>
                          )}
                        </td>
                        <td>
                          <small>
                            {t.source || "no source"} · as of {t.asOf ?? "unknown"}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details id="funding" className={s.fold}>
              <summary>
                <span className={s.sectionLabel}>03 / FUNDING PROGRESS 2026</span>
                <span className={s.foldTitle}>Registered accounts</span>
              </summary>
              <p className={s.muted}>
                Targets from {snap.fundingPlan.source || "the funding plan"}{" "}
                <AsOf date={snap.fundingPlan.asOf} />. Contributed-to-date stays unknown
                until a statement proves it; it is never assumed to be zero.
              </p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th className={s.num}>Target CAD</th>
                      <th className={s.num}>Contributed</th>
                      <th className={s.num}>Remaining</th>
                      <th>Deadline</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funding.map((f) => (
                      <tr key={f.id}>
                        <td>
                          {f.label}
                          <br />
                          <small>
                            {f.statusNote}
                            {f.evidence && <> · evidence: {f.evidence}</>}
                          </small>
                        </td>
                        <td className={s.num}>
                          <Money amount={f.targetCad} />
                        </td>
                        <td className={s.num}>
                          <Money amount={f.contributedCad} />
                          <br />
                          <small>
                            {f.contributedAsOf ? `as of ${f.contributedAsOf}` : "no statement on file"}
                          </small>
                        </td>
                        <td className={s.num}>
                          <Money amount={f.remaining} />
                        </td>
                        <td>
                          {f.deadline ?? "none (carries)"}
                          {f.days !== null && (
                            <>
                              <br />
                              <small>{f.days < 0 ? `${-f.days}d ago` : `${f.days} days`}</small>
                            </>
                          )}
                        </td>
                        <td>
                          <Tag tag={f.tag} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total planned</td>
                      <td className={s.num}>
                        <Money amount={snap.fundingPlan.totalCad} />
                      </td>
                      <td className={s.num}>
                        <span className={s.unknown}>unknown</span>
                      </td>
                      <td className={s.num}>
                        <span className={s.unknown}>unknown</span>
                      </td>
                      <td colSpan={2}>
                        <small>per-target totals are not summed while any contribution is unknown</small>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>

            <details id="cover" className={s.fold}>
              <summary>
                <span className={s.sectionLabel}>04 / STOIC COVER</span>
                <span className={s.foldTitle}>Can {cover.entity ?? "the funding entity"} fund the plan and still meet its tax claims?</span>
              </summary>
              <p className={s.muted}>
                Cover = {cover.entity ?? "entity"} CAD cash − open tax claims − planned
                registered funding. USD cash is excluded. Any unknown input makes the cover
                unknown.
              </p>
              <div className={s.coverRow}>
                <span>
                  {cover.entity ?? "Entity"} CAD cash <AsOf date={cover.cash.asOf} />
                </span>
                <strong>
                  <Money amount={cover.cash.amount} />
                </strong>
              </div>
              <div className={s.coverRow}>
                <span>
                  − open tax claims ({cover.claims.items.length} items){" "}
                  <AsOf date={cover.claims.asOf} />
                  {cover.claims.items.some((c) => c.amountBasis && c.amountBasis !== "stated") && (
                    <small> · one amount parsed from notice text</small>
                  )}
                </span>
                <strong>
                  <Money amount={cover.claims.amount} />
                </strong>
              </div>
              <div className={s.coverRow}>
                <span>
                  − planned registered funding <AsOf date={cover.plan.asOf} />
                </span>
                <strong>
                  <Money amount={cover.plan.amount} />
                </strong>
              </div>
              <div className={`${s.coverRow} ${s.total}`}>
                <span>
                  Cover after funding{" "}
                  {cover.cover !== null && (
                    <Tag tag={cover.cover >= 0 ? "covered" : "short"} />
                  )}
                </span>
                <strong>
                  <Money amount={cover.cover} />
                </strong>
              </div>
            </details>

            <details id="debt" className={s.fold}>
              <summary>
                <span className={s.sectionLabel}>05 / DEBT AND INTEREST</span>
                <span className={s.foldTitle}>Facilities, balances and the monthly interest bill</span>
              </summary>
              <div className={s.statGrid}>
                <div className={s.stat}>
                  <span>Known balances</span>
                  <strong>
                    <Money amount={debt.balanceCad} />
                  </strong>
                  <small>
                    {debt.balanceRows} of {debt.facilities} facilities · as of {debt.asOf ?? "unknown"}
                  </small>
                </div>
                <div className={s.stat}>
                  <span>Monthly interest run rate</span>
                  <strong>
                    <Money amount={debt.interestMonthCad} />
                  </strong>
                  <small>{debt.interestRows} of {debt.facilities} facilities have a known run rate</small>
                </div>
                <div className={s.stat}>
                  <span>Blended rate</span>
                  <strong>
                    <Pct value={debt.blendedRatePct} />
                  </strong>
                  <small>balance-weighted over facilities with a known balance and rate</small>
                </div>
              </div>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Facility</th>
                      <th>Kind</th>
                      <th className={s.num}>Balance CAD</th>
                      <th>As of</th>
                      <th className={s.num}>Rate</th>
                      <th className={s.num}>Interest / month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.debts.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.name}
                          {d.rateNote && (
                            <>
                              <br />
                              <small>{d.rateNote}</small>
                            </>
                          )}
                        </td>
                        <td>
                          {d.kind}
                          <br />
                          <small>{d.scope}</small>
                        </td>
                        <td className={s.num}>
                          <Money amount={d.balanceCad} />
                        </td>
                        <td className={s.nowrap}>{d.balanceAsOf ?? <span className={s.unknown}>unknown</span>}</td>
                        <td className={s.num}>
                          <Pct value={d.ratePct} />
                        </td>
                        <td className={s.num}>
                          <Money amount={d.interestMonthCad} />
                          {d.interestBasis && (
                            <>
                              <br />
                              <small>{d.interestBasis}</small>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details id="burn" className={s.fold}>
              <summary>
                <span className={s.sectionLabel}>06 / TRAILING 30-DAY BURN AND TASKS</span>
                <span className={s.foldTitle}>Burn and the task list</span>
              </summary>
              {burn ? (
                <>
                  <div className={s.statGrid}>
                    <div className={s.stat}>
                      <span>T30D net burn</span>
                      <strong>
                        <Money amount={burn.t30dNetBurnCad} />
                      </strong>
                      <small>
                        as of {burn.asOf ?? "unknown"} · data through {burn.dataThroughPartial ?? "unknown"} (partial)
                      </small>
                    </div>
                    <div className={s.stat}>
                      <span>vs yesterday</span>
                      <strong>
                        <Money amount={burn.vsYesterday} signed />
                      </strong>
                      <small>vs 30 days ago <Money amount={burn.vs30dAgo} signed /></small>
                    </div>
                    {snap.scorecard && (
                      <div className={s.stat}>
                        <span>Last full month net ({snap.scorecard.lastFullMonth.month ?? "unknown"})</span>
                        <strong>
                          <Money amount={snap.scorecard.lastFullMonth.cad} />
                        </strong>
                        <small>
                          trend {snap.scorecard.trend || "unknown"} · savings banked{" "}
                          <Money amount={snap.scorecard.savingsBankedCadMo} />/mo of plan{" "}
                          <Money amount={snap.scorecard.savingsPlanCadMo} />/mo · as of {snap.scorecard.asOf ?? "unknown"}
                        </small>
                      </div>
                    )}
                  </div>
                  <div className={s.statGrid}>
                    {sc && (
                      <div className={s.stat}>
                        <span>Savings banked vs plan</span>
                        <strong>
                          <Pct value={pct(sc.savingsBankedCadMo, sc.savingsPlanCadMo)} />
                        </strong>
                        <small>
                          <Money amount={sc.savingsBankedCadMo} />/mo of <Money amount={sc.savingsPlanCadMo} />/mo
                        </small>
                      </div>
                    )}
                    {sc && (
                      <div className={s.stat}>
                        <span>Corporate payments moved to Ensemble Wise</span>
                        <strong>
                          <Pct value={pct(sc.corpMovedCount, sc.corpTotalCount)} />
                        </strong>
                        <small>
                          {sc.corpMovedCount ?? "unknown"} of {sc.corpTotalCount ?? "unknown"} payments ·{" "}
                          <Money amount={sc.corpMovedCadMo} />/mo of <Money amount={sc.corpTotalCadMo} />/mo
                        </small>
                      </div>
                    )}
                    {burn.debtService && (
                      <div className={s.stat}>
                        <span>Debt service, 30 days ({burn.debtService.start ?? "?"} to {burn.debtService.end ?? "?"})</span>
                        <strong>
                          <Money amount={burn.debtService.totalCad} />
                        </strong>
                        <small>
                          interest <Money amount={burn.debtService.interestCad} /> (in burn) · principal{" "}
                          <Money amount={burn.debtService.principalCad} /> (not in burn) · fees{" "}
                          <Money amount={burn.debtService.feesCad} />
                        </small>
                      </div>
                    )}
                  </div>
                  <details>
                    <summary>Top categories and account freshness</summary>
                    <div className={s.tableWrap}>
                      <table className={s.table}>
                        <thead>
                          <tr>
                            <th>Category (30d)</th>
                            <th className={s.num}>CAD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {burn.topCategories.map(([name, amount], i) => (
                            <tr key={i}>
                              <td>{name}</td>
                              <td className={s.num}>
                                <Money amount={amount} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <table className={s.table}>
                        <thead>
                          <tr>
                            <th>Account</th>
                            <th>Last transaction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {burn.accountsLastDate.map(([name, date], i) => (
                            <tr key={i}>
                              <td>{name}</td>
                              <td>{date ?? "unknown"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {burn.definition && <p className={s.muted}>{burn.definition}</p>}
                  </details>
                </>
              ) : (
                <p className={s.empty}>
                  Burn: <span className={s.unknown}>unknown</span> (no trailing-30-day series in the snapshot).
                </p>
              )}
              <h3 style={{ marginTop: 22 }}>Open tasks ({tasks.length})</h3>
              <p className={s.muted}>
                Sorted by deadline; the first open task is highlighted. Burn impact is CAD a
                month off the T30D net burn once done.
              </p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Deadline</th>
                      <th>Who</th>
                      <th>Task</th>
                      <th>Kind</th>
                      <th className={s.num}>Burn / mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.length === 0 && (
                      <tr>
                        <td colSpan={5} className={s.empty}>No open tasks in the snapshot.</td>
                      </tr>
                    )}
                    {tasks.map((t, i) => (
                      <tr key={t.id} className={i === 0 ? s.first : ""}>
                        <td className={s.nowrap}>{t.deadline ?? "none"}</td>
                        <td>
                          <Tag tag={t.who} />
                        </td>
                        <td>
                          {t.title}
                          {t.why && (
                            <>
                              <br />
                              <small>{t.why}</small>
                            </>
                          )}
                        </td>
                        <td>{t.kind}</td>
                        <td className={s.num}>
                          <Money amount={t.burnCadMo} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className={s.footer}>
              {OWNER_LINE}. The site derives; it does not invent. Entities are never summed.
              Snapshot schema {snap.schemaVersion}. See docs/finance/README.md for the data
              contract.
            </p>
          </>
        )}
      </div>
    </Wrapper>
  );
}
