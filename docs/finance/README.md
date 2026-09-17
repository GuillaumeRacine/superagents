# Finance Dashboard

Private spreadsheet-first workspace at `/finance`, alongside `/business`.
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
private links and records are never committed here. `/finance` and `/api/finance`
recheck the exact-email allowlist before reading `FINANCE_SNAPSHOT_JSON` on the
server; the existing proxy also gates HTML and RSC requests. Routes are dynamic,
private/no-store and excluded from Pagefind and MDX exports. No data is fetched
from imported URLs; following a link uses its original access controls.

The optional managed snapshot is limited to 48 KB, projected and validated.
It is a deployment baseline, not a database. Actual financial-record activation
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
new valuation dates preserve history. The preview states add/replace counts.
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
- Gross/debt cards are explicitly *known subtotals*. Net is unknown unless every
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
