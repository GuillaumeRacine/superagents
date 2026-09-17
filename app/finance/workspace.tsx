"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  columns,
  validateFinance,
  importCsv,
  csvExport,
  assetRows,
  totals,
  monthsThrough,
  propertyPnl,
  transferWarnings,
  transactionSummary,
  reconcileStatements,
} from "@/lib/finance-model.mjs";
import s from "./finance.module.css";

type Row = Record<string, any>;
type Workspace = {
  schemaVersion: number;
  entities: Row[];
  assets: Row[];
  valuations: Row[];
  transactions: Row[];
  statements: Row[];
  updates: Row[];
  tasks: Row[];
  documents: Row[];
  events: Row[];
};
const sections = [
  "Overview",
  "Transactions",
  "Investments",
  "Properties",
  "Documents",
  "Ventures",
  "Import data",
];
const titles = {
  entities: "Entities",
  assets: "Assets",
  valuations: "Valuations",
  transactions: "Transactions",
  statements: "Account statements",
  updates: "Investment updates",
  tasks: "Obligations",
  documents: "Documents",
  events: "Timeline events",
};
const labels = {
  cash: "Cash & deposits",
  public: "Public markets",
  angel: "Angel investments",
  fund: "Funds",
  property: "Real estate",
  liability: "Other liabilities",
  other: "Other assets",
};
function money(value: number | null, currency: string) {
  return value == null
    ? "—"
    : `${currency} ${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })}`;
}
function Link({
  url,
  children = "Open source",
}: {
  url?: string;
  children?: ReactNode;
}) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  ) : (
    <span className={s.muted}>Not linked</span>
  );
}
function Empty({
  title,
  children,
  onImport,
}: {
  title: string;
  children: ReactNode;
  onImport?: () => void;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon} aria-hidden="true">
        ↗
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {onImport && (
        <button className={s.secondary} onClick={onImport}>
          Import a spreadsheet →
        </button>
      )}
    </div>
  );
}
function Panel({
  title,
  kicker,
  children,
  action,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={s.panel}>
      <div className={s.panelHeading}>
        <div>
          {kicker && <p className={s.eyebrow}>{kicker}</p>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FinanceDashboard({
  initial,
  sourceState,
}: {
  initial: Workspace;
  sourceState: string;
}) {
  const [data, setData] = useState<Workspace>(initial),
    [section, setSection] = useState("Overview"),
    [entity, setEntity] = useState("all"),
    [currency, setCurrency] = useState("CAD"),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [query, setQuery] = useState(""),
    [reviewFilter, setReviewFilter] = useState("all"),
    [investment, setInvestment] = useState(""),
    [property, setProperty] = useState(""),
    [dirty, setDirty] = useState(false),
    [notice, setNotice] = useState(""),
    [kind, setKind] = useState("entities"),
    [input, setInput] = useState(""),
    [preview, setPreview] = useState<{
      snapshot: Workspace;
      added?: number;
      replaced?: number;
      rows?: number;
      records?: Row[];
    } | null>(null),
    [error, setError] = useState(""),
    [txPage, setTxPage] = useState(0),
    [taskScope, setTaskScope] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    setTxPage(0);
  }, [entity, currency, month, query, reviewFilter]);
  const change = (next: Workspace, message: string) => {
    setData(next);
    setDirty(true);
    setPreview(null);
    setNotice(message);
  };
  const gotoImport = (table = "assets") => {
    setKind(table);
    setSection("Import data");
    setPreview(null);
    setError("");
  };
  const entityName = (id: string) =>
    data.entities.find((e) => e.id === id)?.name || "Unassigned";
  const currencies = Array.from(
    new Set([
      "CAD",
      ...data.assets.map((a) => a.currency),
      ...data.transactions.map((t) => t.currency),
      ...data.statements.map((v) => v.currency),
    ]),
  ).sort();
  const rows = assetRows(data, month, entity, currency),
    summary = totals(rows),
    included = rows.filter((a) => a.included === "yes");
  const scopeTx = data.transactions.filter(
    (t) =>
      (entity === "all" || t.entityId === entity) && t.currency === currency,
  );
  const currentTx = scopeTx.filter((t) => t.date.startsWith(month)),
    pending = currentTx.filter((t) => t.reviewed !== "yes");
  const transfers = transferWarnings(
      data.transactions.filter((t) => t.currency === currency),
    ),
    missingReceipts = currentTx.filter(
      (t) => ["fee", "expense", "tax"].includes(t.category) && !t.documentUrl,
    ).length;
  const obligations = data.tasks
    .filter(
      (t) => (entity === "all" || t.entityId === entity) && t.status === "open",
    )
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const filteredTx = currentTx
    .filter(
      (t) =>
        (reviewFilter === "all" || t.reviewed === reviewFilter) &&
        `${t.description} ${t.account} ${t.institution} ${entityName(t.entityId)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const angels = rows.filter((a) => a.category === "angel"),
    includedAngels = angels.filter((a) => a.included === "yes"),
    selectedInvestment = angels.find((a) => a.id === investment);
  const properties = rows.filter((a) => a.category === "property"),
    selectedProperty =
      properties.find((a) => a.id === property) || properties[0];
  const pnl = selectedProperty
      ? propertyPnl(data.transactions, selectedProperty.id, month, currency)
      : [],
    pnlMonth = pnl.at(-1),
    pnlCovered = pnl.filter((p) => p.rows > 0);
  const visibleTasks = data.tasks.filter(
    (t) =>
      (entity === "all" || t.entityId === entity) &&
      (taskScope === "all" ||
        !selectedProperty ||
        t.assetId === selectedProperty.id),
  );
  const cash = transactionSummary(currentTx),
    statements = reconcileStatements(data, month, entity, currency);
  const currentPage = Math.min(
    txPage,
    Math.max(0, Math.ceil(filteredTx.length / 50) - 1),
  );
  const docs = data.documents.filter(
    (d) => entity === "all" || d.entityId === entity,
  );
  const allocation = Object.keys(labels)
    .map((category) => ({
      category,
      value: included
        .filter((a) => a.category === category && a.gross !== null)
        .reduce((sum, a) => sum + a.gross, 0),
    }))
    .filter((a) => a.value > 0);
  const months = monthsThrough(month),
    history = months.map((m) => ({
      month: m,
      ...totals(assetRows(data, m, entity, currency)),
    })),
    maxHistory = Math.max(1, ...history.map((h) => Math.abs(h.net || 0)));
  const markReviewed = (id: string) =>
    change(
      {
        ...data,
        transactions: data.transactions.map((t) =>
          t.id === id
            ? { ...t, reviewed: t.reviewed === "yes" ? "no" : "yes" }
            : t,
        ),
      },
      "Review status changed in this workspace. Export to keep your changes.",
    );
  const previewImport = () => {
    setError("");
    setPreview(null);
    try {
      if (kind === "workspace") {
        if (new TextEncoder().encode(input).length > 2000000)
          throw Error("Workspace exceeds 2 MB.");
        setPreview({
          snapshot: validateFinance(JSON.parse(input)) as Workspace,
        });
      } else setPreview(importCsv(data, kind, input) as typeof preview);
    } catch (e) {
      setError(e.message || "Import failed. No records changed.");
    }
  };
  const exportWorkspace = () => {
    download(
      `finance-workspace-${month}.json`,
      JSON.stringify(data),
      "application/json",
    );
    setNotice(
      "Workspace download requested. Keep this private file in your approved storage; re-import it to resume.",
    );
  };
  return (
    <div className={s.workspace} data-pagefind-ignore="all">
      <div className={s.topline}>
        <a href="/business">← Business Dashboard</a>
        <span>
          <i /> Private workspace
        </span>
      </div>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>SUPER AGENTS / FINANCE</p>
          <h1>
            Your capital.
            <br />
            <span>A clearer picture.</span>
          </h1>
          <p className={s.intro}>
            Assets, activity and the details that matter. Together.
          </p>
        </div>
        <div className={s.headerActions}>
          <button className={s.primary} onClick={() => gotoImport()}>
            ＋ Import data
          </button>
          <button className={s.secondary} onClick={exportWorkspace}>
            Export workspace ↗
          </button>
          <span className={s.muted}>
            {dirty
              ? "Unsaved workspace changes"
              : "Spreadsheet-first · Manual updates"}
          </span>
        </div>
      </header>
      <div className={s.controls}>
        <label>
          Entity
          <select
            aria-label="Entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="all">All entities · consolidated</option>
            {data.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          As of month
          <input
            type="month"
            value={month}
            min="1900-01"
            max="9999-12"
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value))
                setMonth(e.target.value);
            }}
          />
        </label>
        <label>
          Currency
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className={s.scopeNote}>
          No currency conversion
          <br />
          Values follow the selected entity
        </div>
      </div>
      <nav className={s.tabs} aria-label="Finance sections">
        {sections.map((name, i) => (
          <button
            key={name}
            onClick={() => {
              setSection(name);
              setNotice("");
            }}
            aria-current={section === name ? "page" : undefined}
          >
            <span className={s.tabIndex}>0{i + 1}</span>
            {name}
          </button>
        ))}
      </nav>
      <div className={s.storage}>
        <span aria-hidden="true">◈</span>
        <p>
          <strong>
            {dirty
              ? "Changes are in this tab only."
              : "A private view of your records."}
          </strong>{" "}
          Imports and edits stay in memory. Export before leaving; reload
          restores the deployed snapshot. No bank or email feeds are connected.
        </p>
      </div>
      {sourceState === "invalid" && (
        <p className={s.error}>
          The deployed snapshot could not be validated. No partial records were
          loaded.
        </p>
      )}
      <div role="status" className={notice ? s.notice : s.srOnly}>
        {notice}
      </div>
      {section === "Overview" && (
        <>
          <div className={s.statGrid}>
            <article className={`${s.stat} ${s.net}`}>
              <span>NET ASSET VALUE</span>
              <strong>{money(summary.net, currency)}</strong>
              <small>
                {summary.known} of {summary.count} included assets have value
                and debt
              </small>
            </article>
            <article className={s.stat}>
              <span>KNOWN GROSS ASSETS</span>
              <strong>{money(summary.gross, currency)}</strong>
              <small>Imported values · before liabilities</small>
            </article>
            <article className={s.stat}>
              <span>KNOWN LIABILITIES</span>
              <strong>{money(summary.debt, currency)}</strong>
              <small>Mortgages and recorded debt</small>
            </article>
            <article className={s.stat}>
              <span>TO REVIEW THIS MONTH</span>
              <strong>
                {currentTx.length ? pending.length : "—"}
                <em> transactions</em>
              </strong>
              <small>
                {currentTx.length
                  ? `${missingReceipts} expense records without documents`
                  : "Import bank exports to begin"}
              </small>
            </article>
          </div>
          <div className={s.twoCol}>
            <Panel
              title="Where your capital sits"
              kicker="ASSET ALLOCATION"
              action={<span className={s.pill}>{currency}</span>}
            >
              {allocation.length ? (
                <>
                  <div className={s.allocationBar}>
                    {allocation.map((a, i) => (
                      <span
                        key={a.category}
                        style={{
                          width: `${(a.value / summary.gross) * 100}%`,
                          background: [
                            "#234f45",
                            "#83a995",
                            "#bbcbbb",
                            "#cba46e",
                            "#e2cfab",
                            "#91a7b2",
                          ][i % 6],
                        }}
                      />
                    ))}
                  </div>
                  {allocation.map((a, i) => (
                    <div className={s.listRow} key={a.category}>
                      <span>
                        <i
                          className={s.dot}
                          style={{
                            background: [
                              "#234f45",
                              "#83a995",
                              "#bbcbbb",
                              "#cba46e",
                              "#e2cfab",
                              "#91a7b2",
                            ][i % 6],
                          }}
                        />
                        {labels[a.category]}
                      </span>
                      <strong>
                        {money(a.value, currency)}{" "}
                        <small>
                          {((a.value / summary.gross) * 100).toFixed(1)}%
                        </small>
                      </strong>
                    </div>
                  ))}
                  <p className={s.footnote}>
                    Shares of known gross values only. Excluded holdings and
                    unknown values are not counted.
                  </p>
                </>
              ) : (
                <Empty
                  title="Your allocation starts with your sheet"
                  onImport={() => gotoImport("assets")}
                >
                  Import your assets, then add a dated valuation for each.
                  Unknown values stay blank.
                </Empty>
              )}
            </Panel>
            <Panel title="Worth a closer look" kicker="ATTENTION">
              <button
                className={s.actionRow}
                onClick={() => setSection("Transactions")}
              >
                <span className={s.actionNumber}>{pending.length}</span>
                <span>
                  <strong>Transactions to review</strong>
                  <small>Selected month · across imported accounts</small>
                </span>
                <span>→</span>
              </button>
              <button
                className={s.actionRow}
                onClick={() => gotoImport("valuations")}
              >
                <span className={s.actionNumber}>
                  {
                    included.filter(
                      (a) => !a.date || a.carried || a.net === null,
                    ).length
                  }
                </span>
                <span>
                  <strong>Valuations to refresh</strong>
                  <small>
                    Missing, incomplete or carried from an earlier month
                  </small>
                </span>
                <span>→</span>
              </button>
              <button
                className={s.actionRow}
                onClick={() => {
                  setTaskScope("all");
                  setSection("Properties");
                }}
              >
                <span className={s.actionNumber}>{obligations.length}</span>
                <span>
                  <strong>Open obligations</strong>
                  <small>Recorded tax, maintenance and admin tasks</small>
                </span>
                <span>→</span>
              </button>
              <p className={s.footnote}>
                Coverage is limited to imported records. No filing completion or
                account completeness is assumed.
              </p>
            </Panel>
          </div>
          <Panel title="The longer view" kicker="12-MONTH HISTORY">
            <div
              className={s.history}
              role="img"
              aria-label={
                "Monthly net asset values. " +
                history
                  .map(
                    (h) =>
                      `${h.month}: ${h.net === null ? "unknown" : money(h.net, currency)}`,
                  )
                  .join("; ")
              }
            >
              {history.map((h) => (
                <div key={h.month} className={s.historyColumn}>
                  <span className={s.historyValue}>
                    {h.net === null ? "—" : money(h.net, currency)}
                  </span>
                  <div className={s.historyTrack}>
                    {h.net !== null && (
                      <div
                        style={{
                          height: `${Math.max(2, (Math.abs(h.net) / maxHistory) * 100)}%`,
                          background: h.net < 0 ? "#a95840" : undefined,
                        }}
                      />
                    )}
                  </div>
                  <span>{h.month.slice(2)}</span>
                </div>
              ))}
            </div>
            <p className={s.footnote}>
              Latest valuation on or before each month end; values carry forward
              until updated. Not investment performance or a return calculation.
            </p>
          </Panel>
          <Panel
            title="Asset register"
            kicker="VALUES & OWNERSHIP"
            action={
              <button
                className={s.textButton}
                onClick={() => gotoImport("valuations")}
              >
                Update values →
              </button>
            }
          >
            {rows.length ? (
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Asset / entity</th>
                      <th>Value date</th>
                      <th>Gross</th>
                      <th>Debt</th>
                      <th>Net</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.name}</strong>
                          <small>
                            {entityName(a.entityId)} · {labels[a.category]}
                            {a.included === "no"
                              ? " · Excluded from totals"
                              : ""}
                          </small>
                        </td>
                        <td>
                          {a.date || "No valuation"}
                          {a.carried && (
                            <small className={s.amber}>Carried forward</small>
                          )}
                        </td>
                        <td>{money(a.gross, currency)}</td>
                        <td>{money(a.debt, currency)}</td>
                        <td>{money(a.net, currency)}</td>
                        <td>
                          <Link url={a.source} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="One register for every asset"
                onImport={() => gotoImport("assets")}
              >
                Cash, market investments, private holdings, properties and
                liabilities. Import entities first, then assets and valuations.
              </Empty>
            )}
          </Panel>
          <Panel title="Ownership map" kicker="ENTITIES">
            {data.entities.length ? (
              <div className={s.entityGrid}>
                {data.entities.map((e) => (
                  <article className={s.entityCard} key={e.id}>
                    <span className={s.pill}>{e.kind}</span>
                    <h3>{e.name}</h3>
                    <p>
                      {e.parentId
                        ? `${e.ownership === null ? "Ownership unconfirmed" : `${e.ownership}% owned`} · ${entityName(e.parentId)}`
                        : "Top-level entity"}
                    </p>
                    <small>
                      {e.notes ||
                        "Company details can be recorded in the entity sheet."}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="Map your holding company and personal estate"
                onImport={() => gotoImport("entities")}
              >
                Add entities and their ownership relationships without blending
                their legal records.
              </Empty>
            )}
            <p className={s.footnote}>
              Ownership is context, not a consolidation engine. Import values
              attributable to you and mark duplicate subsidiary/intercompany
              positions “included: no” to avoid double counting.
            </p>
          </Panel>
          <Panel title="What happened, and when" kicker="EVENT TIMELINE">
            {data.events.filter((e) => rows.some((a) => a.id === e.assetId))
              .length ? (
              data.events
                .filter((e) => rows.some((a) => a.id === e.assetId))
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((e) => (
                  <div className={s.timeline} key={e.id}>
                    <time>{e.date}</time>
                    <div>
                      <h3>{e.title}</h3>
                      <p>
                        {data.assets.find((a) => a.id === e.assetId)?.name} ·{" "}
                        {e.note}
                      </p>
                      <Link url={e.source} />
                    </div>
                  </div>
                ))
            ) : (
              <Empty
                title="Build context alongside the numbers"
                onImport={() => gotoImport("events")}
              >
                Record purchases, financing, exits and other dated events as
                your history develops.
              </Empty>
            )}
          </Panel>
        </>
      )}
      {section === "Transactions" && (
        <>
          <div className={s.statGrid}>
            <article className={s.stat}>
              <span>IMPORTED INFLOWS</span>
              <strong>{money(cash.inflows, currency)}</strong>
              <small>Selected month · includes transfers</small>
            </article>
            <article className={s.stat}>
              <span>IMPORTED OUTFLOWS</span>
              <strong>{money(cash.outflows, currency)}</strong>
              <small>Selected month · includes transfers</small>
            </article>
            <article className={`${s.stat} ${s.net}`}>
              <span>NET CASH MOVEMENT</span>
              <strong>{money(cash.net, currency)}</strong>
              <small>Imported activity only · not account balances</small>
            </article>
            <article className={s.stat}>
              <span>ACCOUNT STATEMENTS</span>
              <strong>{statements.length}</strong>
              <small>
                {statements.filter((v) => v.status === "Balanced").length}{" "}
                balance with imported activity
              </small>
            </article>
          </div>
          <Panel
            title="One view across your accounts"
            kicker="TRANSACTIONS"
            action={
              <button
                className={s.secondary}
                onClick={() =>
                  download(
                    `transactions-${month}.csv`,
                    csvExport("transactions", filteredTx),
                  )
                }
              >
                Export filtered CSV ↗
              </button>
            }
          >
            <p className={s.description}>
              Review imported bank activity by legal entity, institution and
              account. Signed amounts: inflows are positive, outflows negative.
              Review is a manual check, not a bank-balance reconciliation.
            </p>
            <div className={s.filterRow}>
              <label className={s.search}>
                Search
                <input
                  placeholder="Description, account or institution"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Review status
                <select
                  aria-label="Review status"
                  value={reviewFilter}
                  onChange={(e) => setReviewFilter(e.target.value)}
                >
                  <option value="all">All transactions</option>
                  <option value="no">Needs review</option>
                  <option value="yes">Reviewed</option>
                </select>
              </label>
              <button
                className={s.secondary}
                onClick={() => gotoImport("transactions")}
              >
                Import transactions
              </button>
            </div>
            {transfers > 0 && (
              <p className={s.warning}>
                {transfers} transfer group(s) need matching across all entities
                in this currency. Pair IDs must link two equal and opposite
                amounts in the same currency, across different accounts.
              </p>
            )}
            {filteredTx.length ? (
              <>
                <div className={s.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date / account</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Document</th>
                        <th>Reviewed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTx
                        .slice(currentPage * 50, (currentPage + 1) * 50)
                        .map((t) => (
                          <tr key={t.id}>
                            <td>
                              {t.date}
                              <small>
                                {t.institution} · {t.account}
                                <br />
                                {entityName(t.entityId)}
                              </small>
                            </td>
                            <td>
                              <strong>{t.description}</strong>
                              <small>
                                {t.assetId
                                  ? data.assets.find((a) => a.id === t.assetId)
                                      ?.name
                                  : ""}
                              </small>
                            </td>
                            <td>
                              <span className={s.pill}>{t.category}</span>
                            </td>
                            <td className={t.amount < 0 ? s.outflow : s.inflow}>
                              {money(t.amount, currency)}
                            </td>
                            <td>
                              <Link url={t.documentUrl}>Document</Link>
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Reviewed: ${t.description}`}
                                checked={t.reviewed === "yes"}
                                onChange={() => markReviewed(t.id)}
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className={s.pagination}>
                  <span>
                    {filteredTx.length} matching records · Page{" "}
                    {currentPage + 1} of {Math.ceil(filteredTx.length / 50)}
                  </span>
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setTxPage(currentPage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    disabled={(currentPage + 1) * 50 >= filteredTx.length}
                    onClick={() => setTxPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <Empty
                title={
                  data.transactions.length
                    ? "No transactions match this view"
                    : "Bring your accounts into view"
                }
                onImport={() => gotoImport("transactions")}
              >
                {data.transactions.length
                  ? "Try another month, entity, currency or search."
                  : "Import CSV exports from your personal and corporate accounts. Stable transaction IDs keep repeat imports from duplicating rows."}
              </Empty>
            )}
          </Panel>
          <Panel title="Accounting handoff" kicker="RECONCILIATION & SUPPORT">
            <div className={s.entityGrid}>
              <div>
                <h3>Review coverage</h3>
                <p>
                  {currentTx.length - pending.length} / {currentTx.length}{" "}
                  imported transactions reviewed.
                </p>
              </div>
              <div>
                <h3>Supporting records</h3>
                <p>
                  {missingReceipts} expense, fee or tax rows missing a document
                  link.
                </p>
              </div>
              <div>
                <h3>Account reconciliation</h3>
                <p>
                  Compare imported activity to monthly statement opening and
                  closing balances below. A balanced sum does not certify
                  completeness or filing readiness.
                </p>
              </div>
            </div>
          </Panel>
        </>
      )}
      {section === "Transactions" && (
        <Panel
          title="Reconcile account balances"
          kicker="MONTHLY STATEMENTS"
          action={
            <button
              className={s.secondary}
              onClick={() => gotoImport("statements")}
            >
              Import statements
            </button>
          }
        >
          <p className={s.description}>
            Opening balance + signed imported activity = expected closing
            balance. Difference is statement closing minus expected closing.
            Match institution and account labels exactly; a balanced sum does
            not detect missing offsetting entries.
          </p>
          {statements.length ? (
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Account / entity</th>
                    <th>Opening</th>
                    <th>Movement</th>
                    <th>Statement closing</th>
                    <th>Difference</th>
                    <th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>
                          {v.institution} · {v.account}
                        </strong>
                        <small>
                          {entityName(v.entityId)} · {v.rows} transactions
                        </small>
                        <Link url={v.source}>Statement</Link>
                      </td>
                      <td>{money(v.opening, currency)}</td>
                      <td>{money(v.movement, currency)}</td>
                      <td>{money(v.closing, currency)}</td>
                      <td>{money(v.difference, currency)}</td>
                      <td>
                        <span className={s.pill}>{v.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Check each account against its statement"
              onImport={() => gotoImport("statements")}
            >
              Import opening and closing balances for the selected month to
              identify differences in your transaction records.
            </Empty>
          )}
        </Panel>
      )}
      {section === "Investments" && (
        <>
          <div className={s.statGrid}>
            {["active", "dead", "exited"].map((status) => (
              <article className={s.stat} key={status}>
                <span>{status.toUpperCase()} ANGEL INVESTMENTS</span>
                <strong>
                  {angels.length
                    ? angels.filter((a) => a.status === status).length
                    : "—"}
                </strong>
                <small>Imported status · {currency} holdings</small>
              </article>
            ))}
            <article className={s.stat}>
              <span>KNOWN ASSIGNED VALUE</span>
              <strong>
                {money(
                  includedAngels.some((a) => a.gross !== null)
                    ? includedAngels.reduce((sum, a) => sum + (a.gross || 0), 0)
                    : null,
                  currency,
                )}
              </strong>
              <small>Included holdings only · manual marks</small>
            </article>
          </div>
          <Panel title="Behind every investment" kicker="ANGEL PORTFOLIO">
            {angels.length ? (
              <div className={s.investmentGrid}>
                {angels.map((a) => (
                  <button
                    className={s.investmentCard}
                    key={a.id}
                    onClick={() => setInvestment(a.id)}
                    aria-pressed={investment === a.id}
                  >
                    <div>
                      <span
                        className={`${s.pill} ${a.status === "active" ? s.green : ""}`}
                      >
                        {a.status}
                      </span>
                      <span>↗</span>
                    </div>
                    <h3>{a.name}</h3>
                    <strong>{money(a.gross, currency)}</strong>
                    <small>
                      {a.date ? `Marked ${a.date}` : "Valuation not recorded"}
                    </small>
                    <p>
                      {data.updates.filter((u) => u.assetId === a.id).length}{" "}
                      historical updates
                      {a.included === "no" ? " · Excluded from totals" : ""}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Know which companies are moving forward"
                onImport={() => gotoImport("assets")}
              >
                Add angel investments with an active, dead or exited status.
                Assigned values come from your sheet; updates can be imported
                from saved email summaries.
              </Empty>
            )}
          </Panel>
          {selectedInvestment && (
            <Panel
              title={selectedInvestment.name}
              kicker="INVESTMENT DETAIL"
              action={
                <button
                  className={s.textButton}
                  onClick={() => setInvestment("")}
                >
                  Close detail ×
                </button>
              }
            >
              <p>
                {selectedInvestment.notes || "No investment notes recorded."}
              </p>
              <h3>Historical updates & metrics</h3>
              {data.updates.filter((u) => u.assetId === selectedInvestment.id)
                .length ? (
                data.updates
                  .filter((u) => u.assetId === selectedInvestment.id)
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((u) => (
                    <article className={s.timeline} key={u.id}>
                      <time>{u.date}</time>
                      <div>
                        <h3>{u.title}</h3>
                        {u.metric && (
                          <strong>
                            {u.metric}:{" "}
                            {u.value === null
                              ? "Unknown"
                              : u.value.toLocaleString("en-CA")}{" "}
                            {u.unit}
                          </strong>
                        )}
                        <p>{u.note}</p>
                        <Link url={u.url}>Read original update</Link>
                      </div>
                    </article>
                  ))
              ) : (
                <Empty
                  title="No company updates imported"
                  onImport={() => gotoImport("updates")}
                >
                  Add dated updates and their original email or document links.
                  Automatic email monitoring is not connected.
                </Empty>
              )}
            </Panel>
          )}
        </>
      )}
      {section === "Properties" && (
        <>
          <Panel
            title="Property performance"
            kicker="REAL ESTATE"
            action={
              properties.length > 0 ? (
                <label>
                  Property
                  <select
                    aria-label="Property"
                    value={selectedProperty.id}
                    onChange={(e) => setProperty(e.target.value)}
                  >
                    {properties.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null
            }
          >
            {!selectedProperty ? (
              <Empty
                title="Start with your rental, then your home"
                onImport={() => gotoImport("assets")}
              >
                Add property assets, valuations and mortgage balances. Link
                transactions and obligations using the property’s asset ID.
              </Empty>
            ) : (
              <>
                <p className={s.description}>
                  {selectedProperty.name} ·{" "}
                  {entityName(selectedProperty.entityId)} ·{" "}
                  {selectedProperty.propertyType === "rental"
                    ? "Rental property"
                    : selectedProperty.propertyType === "home"
                      ? "Residence"
                      : "Property type unconfirmed"}
                </p>
                <div className={s.statGrid}>
                  <article className={s.stat}>
                    <span>GROSS VALUE</span>
                    <strong>{money(selectedProperty.gross, currency)}</strong>
                  </article>
                  <article className={s.stat}>
                    <span>MORTGAGE / DEBT</span>
                    <strong>{money(selectedProperty.debt, currency)}</strong>
                  </article>
                  <article className={s.stat}>
                    <span>NET EQUITY</span>
                    <strong>{money(selectedProperty.net, currency)}</strong>
                  </article>
                  <article className={s.stat}>
                    <span>VALUE DATE</span>
                    <strong className={s.dateValue}>
                      {selectedProperty.date || "Not recorded"}
                    </strong>
                    <small>
                      {selectedProperty.carried
                        ? "Carried forward"
                        : "Selected month"}
                    </small>
                  </article>
                </div>
                <h3 className={s.subheading}>Operating P&L · cash basis</h3>
                <p className={s.description}>
                  Imported income less fees, operating expenses and taxes.
                  Principal, capital, transfers and “other” movements are
                  excluded. This is a working cash view, not a filed financial
                  statement.
                </p>
                <div className={s.twoCol}>
                  <div className={s.pnSummary}>
                    <span>{month}</span>
                    <strong>{money(pnlMonth?.net ?? null, currency)}</strong>
                    <small>Operating net · selected month</small>
                  </div>
                  <div className={s.pnSummary}>
                    <span>TRAILING 12 MONTHS</span>
                    <strong>
                      {money(
                        pnlCovered.length
                          ? pnlCovered.reduce((sum, p) => sum + p.net, 0)
                          : null,
                        currency,
                      )}
                    </strong>
                    <small>
                      Partial activity · {pnlCovered.length}/12 months with
                      imported records; completeness unverified
                    </small>
                  </div>
                </div>
                <div className={s.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Revenue</th>
                        <th>Fees + expenses + tax</th>
                        <th>Operating net</th>
                        <th>Excluded cash movements</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pnl.map((p) => (
                        <tr key={p.period}>
                          <td>
                            {p.period}
                            {!p.rows && <small>No records</small>}
                          </td>
                          <td>{money(p.income, currency)}</td>
                          <td>{money(p.costs, currency)}</td>
                          <td>{money(p.net, currency)}</td>
                          <td>{p.rows ? money(p.excluded, currency) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
          <Panel
            title="On the horizon"
            kicker="OBLIGATIONS & MAINTENANCE"
            action={
              <label>
                Obligation scope
                <select
                  aria-label="Obligation scope"
                  value={selectedProperty ? taskScope : "all"}
                  onChange={(e) => setTaskScope(e.target.value)}
                >
                  <option value="all">All obligations in entity view</option>
                  {selectedProperty && (
                    <option value="property">Selected property only</option>
                  )}
                </select>
              </label>
            }
          >
            {visibleTasks.length ? (
              visibleTasks
                .sort((a, b) =>
                  (a.due || "9999").localeCompare(b.due || "9999"),
                )
                .map((t) => (
                  <div className={s.task} key={t.id}>
                    <input
                      type="checkbox"
                      aria-label={`Complete: ${t.title}`}
                      checked={t.status === "done"}
                      onChange={() =>
                        change(
                          {
                            ...data,
                            tasks: data.tasks.map((r) =>
                              r.id === t.id
                                ? {
                                    ...r,
                                    status:
                                      r.status === "done" ? "open" : "done",
                                  }
                                : r,
                            ),
                          },
                          "Obligation updated. Export your workspace to keep this change.",
                        )
                      }
                    />
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.due ? `Due ${t.due}` : "Due date not recorded"} ·{" "}
                        {t.status}
                      </small>
                    </div>
                    <Link url={t.source} />
                  </div>
                ))
            ) : (
              <Empty
                title="Keep the next obligation visible"
                onImport={() => gotoImport("tasks")}
              >
                Import known due dates for taxes, maintenance and administrative
                work. No due dates have been invented.
              </Empty>
            )}
          </Panel>
        </>
      )}
      {section === "Documents" && (
        <Panel
          title="A home for the supporting details"
          kicker="DOCUMENTS & COMPANY ADMIN"
          action={
            <button
              className={s.secondary}
              onClick={() => gotoImport("documents")}
            >
              Add document links
            </button>
          }
        >
          <p className={s.description}>
            Legal and incorporation records, financial statements, tax filings,
            banking instructions and login guides. Link to the originals; keep
            credentials in your password manager.
          </p>
          {docs.length ? (
            <div className={s.documentGrid}>
              {docs.map((d) => (
                <article className={s.documentCard} key={d.id}>
                  <span className={s.documentIcon} aria-hidden="true">
                    ▤
                  </span>
                  <div>
                    <span className={s.pill}>{d.category}</span>
                    <h3>{d.name}</h3>
                    <small>
                      {entityName(d.entityId)} {d.period && `· ${d.period}`}
                    </small>
                    <p>{d.note}</p>
                    <Link url={d.url}>Open document</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Company records, easy to find"
              onImport={() => gotoImport("documents")}
            >
              Import links to your existing folders, statements and filing
              guides. Each record belongs to an entity and keeps its original
              access permissions.
            </Empty>
          )}
        </Panel>
      )}
      {section === "Ventures" && (
        <Panel title="Room for what comes next" kicker="OPERATING COMPANIES">
          {data.entities
            .filter(
              (e) =>
                e.kind === "operating" &&
                (entity === "all" || entity === e.id || entity === e.parentId),
            )
            .map((e) => (
              <article className={s.venture} key={e.id}>
                <span className={s.pill}>Project metrics · Not connected</span>
                <h3>{e.name}</h3>
                <p>
                  {e.parentId
                    ? `${e.ownership === null ? "Ownership unconfirmed" : `${e.ownership}% owned`} by ${entityName(e.parentId)}`
                    : "Ownership not recorded"}
                </p>
                <button
                  className={s.secondary}
                  onClick={() => {
                    setEntity(e.id);
                    setSection("Documents");
                  }}
                >
                  Company documents →
                </button>
              </article>
            ))}
          <Empty title="Projects will have their place here">
            Active projects and operating metrics are intentionally empty for
            now. Company records are available in Documents as you add them.
          </Empty>
        </Panel>
      )}
      {section === "Import data" && (
        <Panel
          title="From your spreadsheet to one clear view"
          kicker="IMPORT & MONTHLY UPDATES"
        >
          <p className={s.description}>
            Export a sheet as CSV, use the matching template headers, and
            preview it here. Imports stay in this tab; export a JSON workspace
            to preserve history and changes. Start with entities, then assets,
            then the other tables.
          </p>
          <div className={s.importGrid}>
            <div>
              <label>
                Import table
                <select
                  aria-label="Import table"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    setPreview(null);
                    setError("");
                    setInput("");
                  }}
                >
                  {Object.entries(titles).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                  <option value="workspace">Restore workspace (JSON)</option>
                </select>
              </label>
              <div className={s.importActions}>
                {kind !== "workspace" && (
                  <button
                    className={s.secondary}
                    onClick={() =>
                      download(
                        `${kind}-template.csv`,
                        columns[kind].join(",") + "\r\n",
                      )
                    }
                  >
                    Download CSV headers ↓
                  </button>
                )}
                <button
                  className={s.secondary}
                  onClick={() => fileRef.current?.click()}
                >
                  Choose {kind === "workspace" ? "JSON" : "CSV"} file
                </button>
                <input
                  ref={fileRef}
                  className={s.srOnly}
                  type="file"
                  accept={kind === "workspace" ? ".json" : ".csv,text/csv"}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setError("");
                    setPreview(null);
                    if (file) {
                      if (file.size > 2000000) setError("File exceeds 2 MB.");
                      else setInput(await file.text());
                    }
                    e.target.value = "";
                  }}
                />
              </div>
              <label>
                Or paste{" "}
                {kind === "workspace" ? "workspace JSON" : "CSV content"}
                <textarea
                  value={input}
                  spellCheck={false}
                  placeholder={
                    kind === "workspace"
                      ? "Paste your exported workspace JSON…"
                      : columns[kind].join(",")
                  }
                  onChange={(e) => {
                    setInput(e.target.value);
                    setPreview(null);
                    setError("");
                  }}
                  rows={10}
                />
              </label>
              <button
                className={s.primary}
                disabled={!input.trim()}
                onClick={previewImport}
              >
                Validate & preview →
              </button>
            </div>
            <aside className={s.importHelp}>
              <h3>A reliable monthly routine</h3>
              <ol>
                <li>Restore your latest workspace JSON.</li>
                <li>Import new transactions with stable IDs.</li>
                <li>Add valuations dated for the new month.</li>
                <li>Review gaps and supporting documents.</li>
                <li>Export the updated workspace to private storage.</li>
              </ol>
              <h3>Import rules</h3>
              <p>
                Dates: YYYY-MM-DD. Currency: CAD, USD, or another uppercase
                three-letter code. Numbers: plain decimals, no symbols or
                separators. Blank values mean unknown; use 0 only when
                confirmed.
              </p>
              <p>
                IDs match existing records. A matching ID replaces that entire
                row; valuations match on assetId + date. New dates preserve
                history. Different IDs are separate records, even when amounts
                match.
              </p>
              <details>
                <summary>Field reference for this table</summary>
                <p>
                  {kind === "entities"
                    ? "kind: holding, personal, operating, other. parentId links entities; ownership is a percentage."
                    : kind === "assets"
                      ? "category: cash, public, angel, fund, property, liability, other. status: active, dead, exited. propertyType: rental, home, or blank. included: yes/no. Use no for duplicate intercompany positions. Enter only your attributable share of gross and debt."
                      : kind === "transactions"
                        ? "category: income, fee, expense, tax, transfer, principal, capital, other. reviewed: yes/no. Negative amounts are outflows. assetId is optional. transferPairId connects two sides of a transfer."
                        : kind === "statements"
                          ? "One row per account and month. period: YYYY-MM. opening and closing are signed statement balances. Match institution and account names exactly to the transaction sheet. Blank balances remain unknown."
                          : kind === "valuations"
                            ? "gross and debt are non-negative; blank is unknown. For unsecured debt use a liability asset with gross 0. source is an optional HTTPS evidence link."
                            : kind === "tasks"
                              ? "status: open/done. due is optional; do not infer statutory deadlines. assetId is optional."
                              : kind === "updates"
                                ? "metric, numeric value and unit are optional. note retains context. url links to the original update."
                                : kind === "documents"
                                  ? "category is your own label, such as Legal, Statements or Filing guide. url is required HTTPS. Do not put passwords into notes."
                                  : kind === "events"
                                    ? "Use a dated title and note for changes affecting an asset. source is an optional HTTPS link."
                                    : "Restoring JSON replaces the entire workspace after preview. Export the current workspace first if you need to preserve it."}
                </p>
              </details>
            </aside>
          </div>
          {error && (
            <p role="alert" className={s.error}>
              {error} No records changed.
            </p>
          )}
          {preview && (
            <div className={s.preview}>
              <h3>
                {kind === "workspace" ? "Restore preview" : "Import preview"}
              </h3>
              <p>
                {kind === "workspace"
                  ? "This will replace your current workspace."
                  : `${preview.rows} validated rows · ${preview.added} new · ${preview.replaced} existing rows replaced.`}
              </p>
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>After import</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(titles).map(([k, v]) => (
                      <tr key={k}>
                        <td>{v}</td>
                        <td>{preview.snapshot[k].length} records</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {kind !== "workspace" && (
                <>
                  <p>
                    First 10 incoming rows. Blank fields replace existing values
                    with blanks.
                  </p>
                  <div className={s.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          {columns[kind].map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.records?.slice(0, 10).map((r, i) => (
                          <tr key={i}>
                            {columns[kind].map((c) => (
                              <td key={c}>{r[c] ?? "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className={s.importActions}>
                <button
                  className={s.primary}
                  onClick={() => {
                    const next = preview.snapshot;
                    change(
                      next,
                      "Import applied to this tab. Export your workspace before leaving.",
                    );
                    setEntity("all");
                    setInput("");
                  }}
                >
                  {kind === "workspace" ? "Replace workspace" : "Apply import"}
                </button>
                <button
                  className={s.secondary}
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Panel>
      )}
      <footer className={s.footer}>
        <span>
          SUPER AGENTS <span>/ FINANCE</span>
        </span>
        <p>Private by design. Grounded in your records.</p>
      </footer>
    </div>
  );
}
