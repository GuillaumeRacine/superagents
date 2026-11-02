# Finance Dashboards

## Record of truth (2026-11-02)

The record for every money data type is `main` of the private MoneyOS repository
(contract `SOURCE_OF_TRUTH.md` + `sources.json`, acknowledged in `ACK.md`, enforced
by `scripts/check_sot.py`; plan of record is that repository's issue #1, rulings
R1–R3; history Context#176). `Context/cfo-feed` is a frozen mirror and pointer. The
snapshot builder reads a local fast-forward-only clone of the record (`MONEYOS_DIR`);
the refresh job on the owning workstation pulls it before each build (issue #54,
tracks 2 and 3). The public page is `/workflows/finance-moneyos`; the registry entry
is `finance-moneyos`.

## Cash and Invest split (2026-10-19)

The single `/finance` dashboard is replaced by two agent-owned dashboards
(issue #44). Since issue #49 all private dashboards live under `/dashboard`:
the hub at `/dashboard` links Cash, Invest and Business and stays behind the
same allowlist gate; `/finance`, `/cash`, `/invest` and `/business` redirect
permanently to their `/dashboard` paths. All routes are dynamic,
private/no-store, excluded from Pagefind and MDX exports, and recheck the
exact-email allowlist on the server.

| Route | Owner | Data contract | Env | Cadence |
|---|---|---|---|---|
| `/dashboard/cash` | Chief of Cash (GrokBot); feed posts weekdays 08:00 in #cash; record of truth `main` of the private MoneyOS repository (`SOURCE_OF_TRUTH.md`, `sources.json`; see `/workflows/finance-moneyos`), with `Context/cfo-feed` as a frozen mirror until the jobs are repointed | `cash_snapshot_v1`, schema and validation in `lib/cash-model.mjs`, built by `scripts/build-cash-snapshot.mjs` from a local checkout of `cfo-feed/` (`CONTEXT_DIR`, default `~/Context`) | `CASH_SNAPSHOT_JSON` (≤ 48,000 bytes) or `CASH_SNAPSHOT_GZIP_BASE64` (same bounds and fail-closed rules as the finance transport; `lib/snapshot-transport.mjs`) | weekdays after the feed; refresh job not yet scheduled |
| `/dashboard/invest` | to assign (interim: Claude monthly `/cfo invest` run, Context#151) | the former finance workspace, unchanged; `lib/finance-model.mjs` | `FINANCE_SNAPSHOT_JSON` / `FINANCE_SNAPSHOT_GZIP_BASE64` | monthly, month-end |

Cash rules: null means unknown and renders as "unknown", never 0; a missing
bank is never zero; balances are listed per entity and per currency and are
never summed across entities; every number carries its own as-of date; account
identifiers keep at most their last four digits; task logins, URLs and search
strings are dropped by the builder. The Stoic cover line is the one derived
figure: entity CAD cash − open tax claims of that entity − planned registered
funding, each input dated, unknown if any input is unknown. Funding
contributed-to-date stays null until a statement proves it. Debt totals state
how many facilities they cover; the blended rate is balance-weighted over
facilities with both a balance and a rate.

Optional `cash_snapshot_v1` additions (older snapshots stay valid): `burn.series`
(up to 400 `[date, CAD]` points; the builder sends the last 180 complete days of
`cfo-feed/data/t30d-net-burn.csv`), `burn.debtService` (30-day interest vs principal
from `t30d.json`) and `scorecard.corpMoved*`/`corpTotal*` (payments moved to the
Ensemble Wise card). The page shows an always-visible as-of bar and a red stale banner,
computed at render: snapshot built more than 36 hours ago, or burn, scorecard or feed
post more than 3 days old. `/finance/cash` and `/finance/invest` redirect to `/dashboard/cash`
and `/dashboard/invest`. The added series costs about 1.8 KB of gzip-base64; check the 64 KB
Vercel env budget before publishing.

MoneyOS record (issue #54, 2026-11-02). The builder reads the private MoneyOS
repository (`main`; contract `SOURCE_OF_TRUTH.md` + `sources.json`) from a
local fast-forward-only clone of its main branch (set `MONEYOS_DIR`):
`data/cfo-feed/*` and `reports/TARGETS.md` replace the former Context copies,
and it fails with a clear message when the directory or `data/cfo-feed/facts.json`
is missing. Only the feed's memory, `cfo-feed/state.json`, is still read from
`CONTEXT_DIR` (default `~/Context`), optionally, until the feed job moves
(moneyos#1 phase 3). Six more optional `cash_snapshot_v1` sections come from the
record, each nullable and validated with the same strictness (null means unknown,
ISO dates, bounded text, row caps): `scorecard.savingsRate` (the North Star,
target 20%+: newest month and the T12 row of `data/savings-rate.csv`, headline
column `savings_rate`, else `savings_rate_incl`; rate as a percent; as-of = end of
the newest month; one-line definition), `books` (Suspense row and TOTAL row of
`books/trial-balance.csv`, `balanced` when the total is within a cent of zero,
`ties` / `does not tie` counts of `data/tieout.csv`, as-of = newest statement
date), `payables` (open rows of `data/payables-receivables.csv`, at most 30,
counterparty and description masked, free-text due dates kept as `dueNote` next
to a null `dueDate`), `clarify` (open rows and distinct batches of
`clarify/to-clarify.csv`, open rows of `clarify/open-questions.csv`), `contract`
(version and date from `sources.json`, hash computed exactly as
`scripts/check_sot.py --hash` does: sha256 of `SOURCE_OF_TRUTH.md` bytes plus
Python-style canonical JSON of `sources.json` without `next_question_id`, first
12 hex, see `lib/moneyos-contract.mjs`; required and acknowledged agents from
`ACK.md`; grace date = contract date + `ack_grace_days`) and `cabin` (newest row
of `data/cabin-statements.csv`: nights, gross, sales taxes, deposit, net ex tax,
statements on file). The page shows them as bands (Savings rate after the burn
headline; Books, Payables and receivables, Open items, Contract and Cabin after
Needs you soon); overdue or imminent payables and a contract acknowledgement
missing after grace also enter Needs you soon, and a savings-rate as-of older
than 45 days is a stale reason. A full snapshot is about 10.6 KB of gzip-base64.

Tests: `npm run test:cash` (model), `node scripts/verify-cash.mjs` (gate and
render against a local build with a throwaway secret and fictional records).
`scripts/verify-finance.mjs` and `scripts/verify-finance-ui.mjs` now exercise
the workspace at `/dashboard/invest`. Still to do: the Invest refactor (#39), a scheduled
Cash snapshot refresh, and the Chief of Cash snapshot path (Context#172).

## Finance workspace (now `/dashboard/invest`)

Private spreadsheet-first workspace at `/dashboard/invest` (formerly `/finance`,
then `/invest`), alongside `/dashboard/business`.
Execution and acceptance proof: issue #36. Inherits the Business Dashboard lean
ISA (draft, unregistered, 2026-09-14), especially its privacy, provenance and
coverage claims. No maturity promotion or owner acceptance is implied.

## Shipped scope

- Entity hierarchy; per-entity and currency views; asset register, gross/debt/net,
  allocation, monthly marks and timeline events.
- Multi-account transaction import, review flags, document coverage, transfer-pair
  diagnostics, monthly statement-balance reconciliation and filtered accountant CSV export.
- Angel statuses and dated company-update/metric drilldowns.
- Property value/debt/equity, monthly and trailing-12-month operating cash P&L,
  and dated obligations.
- Entity-specific corporate-document links and an operating-company placeholder.
- Validated CSV imports, atomic preview/apply, JSON workspace export/restore.

## Privacy and storage

Public code and tests contain generic/fictional examples only. Entity names,
private links and records are never committed here. `/dashboard/invest` and `/api/finance`
recheck the exact-email allowlist before reading the managed finance snapshot on the
server; the existing proxy also gates HTML and RSC requests. Routes are dynamic,
private/no-store and excluded from Pagefind and MDX exports. No data is fetched
from imported URLs; following a link uses its original access controls.

The optional managed snapshot accepts `FINANCE_SNAPSHOT_JSON` up to 48,000 bytes,
or `FINANCE_SNAPSHOT_GZIP_BASE64`: canonical padded base64 of gzip-compressed
UTF-8 JSON, limited to 48,000 encoded bytes and 2,000,000 decompressed bytes.
The server bounds decompression before parsing and applies the same schema,
reference, normalized-size and row-count validation. A present compressed value
takes precedence; any invalid value (including an empty string) fails closed
without falling back to JSON. Remove the compressed variable to return to the
JSON transport. Keep both forms in private managed environment configuration;
compression provides no encryption. This is a deployment baseline, not a database.
Actual financial-record activation
inherits the Business Dashboard real-OAuth and confidentiality gates.

Browser imports/edits live in React memory only. They never POST to the server
and never use localStorage. Reloading resets to the deployment baseline; export
JSON to approved private storage and restore it to continue. A beforeunload
warning protects edited work from accidental navigation. Download initiation is
not treated as proof of successful saving, so the warning remains after export.
No cross-device sync, unattended ingestion, credential storage or scheduled jobs.

## Data contract and monthly routine

`lib/finance-model.mjs` owns fields, required columns, enums and validation.
The Import data section provides headers and field guidance. Import entities
first, then assets, then valuations, transactions, statements, updates, tasks, documents and
events. JSON restore validates all tables together. Files and the combined workspace are bounded at 2 MB,
with at most 10,000 rows per table. All errors leave the current workspace intact.

IDs identify rows, not their position in a sheet. Valuations use assetId + date.
Reimporting matching IDs replaces the entire row, including blank fields;
new valuation dates preserve history. The preview states add/replace counts and warns how many previously populated
fields will be cleared, including columns omitted from the incoming CSV.
Bank export schemas must be mapped to these documented headers; automatic
mapping of arbitrary bank spreadsheets and direct XLSX import are not included.

Suggested routine: restore prior workspace; import new transaction rows; add
monthly valuations; review coverage and supporting records; export JSON and any
filtered CSV needed by an accountant. JSON is the lossless restore format.
CSV export protects spreadsheet cells from formula injection and is intended
for accounting handoff, not lossless workspace round trips.

## Arithmetic and interpretation

- Values are kept in their original three-letter currency; no FX conversion.
- An entity filter is exact, not an automatic parent/subsidiary consolidation.
  All entities sums included asset rows. Ownership percentages are descriptive;
  enter only the attributable share of gross and debt. Exclude duplicated
  intercompany/subsidiary valuations with `included: no`.
- Gross/debt cards are explicitly _known subtotals_. Net is unknown unless every
  included asset has both amounts. A blank is never coerced to zero. A liability
  can be an asset row with category liability, gross zero and positive debt.
- Last dated value on/before month-end is carried forward and labeled. Historical
  charts are mark histories, not cash-flow-adjusted performance or returns.
- Transactions use signed amounts; a review flag is not a bank reconciliation.
  Transfer pairs are checked across all entities and need two opposite same-currency amounts in distinct accounts.
  Different IDs can still be economic duplicates; source ID quality matters.
- Statement reconciliation matches entity + institution + account + currency +
  month. Expected closing is opening plus imported signed activity; difference
  is statement closing minus expected. Missing balances stay unknown. A balanced
  sum cannot detect missing offsetting entries and never certifies completeness.
- Property P&L uses income, fee, expense and tax amounts on a cash basis. Refunds
  naturally offset costs. Transfer, principal, capital and other are excluded.
  Mortgage interest must be classified as expense separately from principal.
  Empty months are unknown. TTM is a partial imported-activity subtotal even if
  every month has rows: no statement coverage certification is available.
- No tax advice, inferred filing deadlines, invented company metrics, automatic
  email refresh, full ledger, accrual accounting or filing-readiness claim.

## Verification and rollback

Run `npm run check`, `npm run build`, `node scripts/verify-finance.mjs`, and the
existing smoke and business verification. Review desktop/mobile and real OAuth.
Use fictional markers for session and static-asset exclusion tests. Never create
synthetic production sessions or install a test login bypass.

Rollback application code through GitHub and Vercel. Remove the optional finance
snapshot and redeploy to reset its baseline. Exported source workspaces remain
unchanged. No bank, source document, or email records are modified by this app.

## Source evidence and refresh handoff

Runtime snapshots may include `sources` (name, HTTPS URL, observation cutoff,
check date, coverage status and note) and `reportedTotals` (dated, currency-specific,
source-reported portfolio net totals). Both tables are optional for older exports.
Reported totals are shown separately as unreconciled workbook history, never
substituted for the asset register's calculated net value. The chart carries the
last source observation forward and exposes actual dates and evidence.

Asset status also accepts `closed` and `unknown`. Closed alone proves neither
an exit nor a loss; current source status must not be interpreted historically.
Amounts on closed positions are preserved. Source percentages are not imported;
allocation is recomputed from included gross values. Missing property debt and
unverified ownership remain explicit gaps.

The private source owner handles read-only extraction, statement control checks,
change detection and managed snapshot publication. Bank balance positions that
may overlap workbook cash must be excluded from totals pending reconciliation.
New or changed documents are inventory evidence until parsed and reconciled.
Authenticated production readback is required for the initial baseline; refresh
jobs must retain their prior success state on failure and record deployment
uncertainty separately. No spreadsheet, bank or email source is modified here.
