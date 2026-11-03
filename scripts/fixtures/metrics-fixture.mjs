// Fictional moneyos_metrics_v1 record for tests and the render gate. Every name,
// amount and account digit is invented; the marker lets the gate prove the
// value never reaches a public asset. Two entities so the no-sum rule can be
// exercised; one unknown per block so "unknown never 0" can be asserted.
export const METRICS_MARKER = "SYNTHETIC_PRIVATE_METRICS_SENTINEL";

export const metricsFixture = (marker = METRICS_MARKER) => ({
  schema: "moneyos_metrics_v1",
  generated_at: "2026-10-19T11:30:00Z",
  inputs_hash: "0a1b2c3d4e5f",
  built_from_head: "fedcba9876",
  moneyos_sha: "abc1234def",
  verdicts_as_of: "2026-10-19T11:30:00Z",
  ledger_through: "2026-10-18",
  freshness: [
    { last4: "1111", label: `${marker} chequing`, entity: "personal", newest_row: "2026-10-18", cadence_days: 3, stale: false, feed: "monarch" },
    { last4: "2222", label: "Example card", entity: "personal", newest_row: "2026-09-01", cadence_days: 10, stale: true, feed: "statement" },
    { last4: "3333", label: "Example holdco bank", entity: "holdco", newest_row: "2026-10-10", cadence_days: 31, stale: null, feed: "statement" },
    { last4: "4444", label: "Example dead feed", entity: "personal", newest_row: "2026-08-01", cadence_days: 10, stale: null, feed: "none" },
  ],
  north_star: {
    savings_rate: {
      month: "2026-09",
      rate_pct: -12.5,
      income_cad: 8000,
      crypto_cad: 2000,
      earned_income_ex_crypto_cad: 6000,
      opex_cad: 9000,
      interest_cad: 1500,
      principal_cad: 700,
      status: "provisional",
      t12_label: "T12 2025-10 to 2026-09",
      t12_rate_pct: 4,
      t12_income_cad: 120000,
      t12_opex_cad: 115200,
      definition: "(income − opex) / income; example definition",
      target_pct: 20,
      as_of: "2026-09-30",
    },
  },
  burn: {
    t30d_net_burn_cad: 5678,
    as_of: "2026-10-18",
    vs_30d_ago_cad: -210,
    scope: "personal + example opco, CAD at BoC",
    method: "sum of outflows minus inflows over the trailing 30 complete days",
    series: [
      ["2026-10-16", 5900],
      ["2026-10-15", 6000],
      ["2026-10-17", 5800],
      ["2026-10-18", 5678],
    ],
  },
  pnl_monthly: [
    { month: "2026-09", income_cad: 8000, crypto_cad: 2000, owner_flows_in_cad: 0, opex_cad: 9000, interest_cad: 1500, principal_cad: 700, net_cad: -1000, status: "provisional" },
    { month: "2026-08", income_cad: 9000, crypto_cad: 0, owner_flows_in_cad: 500, opex_cad: 8000, interest_cad: 1400, principal_cad: 700, net_cad: 1000, status: "final" },
    { month: "2026-07", income_cad: null, crypto_cad: null, owner_flows_in_cad: null, opex_cad: 7000, interest_cad: 1400, principal_cad: 700, net_cad: null, status: "final" },
  ],
  income_by_source_t12: [
    { source: `${marker} salary`, cad: 90000, share_pct: 75 },
    { source: "Crypto sales (example)", cad: 30000, share_pct: 25 },
  ],
  spend_by_line: {
    month: "2026-09",
    rows: [
      { line: "Living: Food: groceries", month_cad: 1200, t12_cad: 13200, t12_avg_cad: 1100 },
      { line: "Living: Housing: interest", month_cad: 1500, t12_cad: 17400, t12_avg_cad: 1450 },
      { line: "Example: unknown month", month_cad: null, t12_cad: 600, t12_avg_cad: 50 },
    ],
    month_total_cad: 9000,
    t12_total_cad: 115200,
  },
  interest_by_month: [
    { month: "2026-09", total_cad: 1500, by_account: { "0836": 1000, "0002": 500 } },
    { month: "2026-08", total_cad: 1400, by_account: { "0836": 950, "0002": 450 } },
  ],
  debts: {
    rows: [
      { id: "m1", name: "Example mortgage ...0836", kind: "mortgage", entity: "personal", balance_cad: 400000, as_of: "2026-09-30", rate_pct: 3.79, interest_month_cad: 1000 },
      { id: "l1", name: "Example line 0002", kind: "line", entity: "personal", balance_cad: 50000, as_of: "2026-08", rate_pct: 6, interest_month_cad: null },
      { id: "o1", name: "Example overdraft 0003", kind: "overdraft", entity: "opco", balance_cad: 0, as_of: "2026-09-30", rate_pct: 21, interest_month_cad: 0 },
    ],
    total_cad: 450000,
    as_of: "2026-09-30",
    facilities: 3,
  },
  liquidity: {
    by_entity: [
      { entity: "holdco", currency: "CAD", cash: 100000, as_of: "2026-09-30", source: "Example bank 3333 stmt" },
      { entity: "opco", currency: "CAD", cash: 1000, as_of: "2026-09-30", source: "Example bank 5555 stmt" },
      { entity: "personal", currency: "CAD", cash: null, as_of: null, source: "", missing_accounts: ["1111", "4444"] },
    ],
    unused_credit_cad: 9750,
    payables_next_60d_cad: 3200,
    runway_months_personal: null,
    runway_method: "personal CAD cash / T12 average opex",
  },
  net_worth: {
    by_entity: [
      { entity: "personal", assets_cad: 900000, debts_cad: 450000, net_cad: 450000, as_of: "2026-09-30", confidence: "medium", source: "holdings and assets csv (preview, not approved)" },
      { entity: "holdco", assets_cad: null, debts_cad: 0, net_cad: null, as_of: "2026-09-30", confidence: "low", source: "no month-end column yet" },
    ],
    sheet_total_cad: 1234567,
    sheet_total_as_of: "2026-09-30",
    note: "preview until Gui approves the month-end column",
  },
  funding: {
    targets: [
      { id: "rrsp", label: "Example RRSP", target_cad: 10000, contributed_cad: null, contributed_as_of: null, deadline: "2027-03-01", status: "open" },
      { id: "blocked", label: "Example blocked", target_cad: 100, contributed_cad: null, contributed_as_of: null, deadline: "2026-12-31", status: "blocked" },
    ],
    total_target_cad: 10100,
  },
  payables: [
    { id: "P01", priority: 1, type: "payable", entity: "personal", counterparty: `${marker}_PAYEE`, description: "Example bill 1234567", amount: 321, currency: "CAD", due_date: "2026-10-17", due_note: "", status: "open", last_checked: "2026-10-19" },
    { id: "P02", priority: 2, type: "payable", entity: "holdco", counterparty: "Example Card", description: "", amount: null, currency: "CAD", due_date: null, due_note: "next statement", status: "MISSING", last_checked: "2026-10-19" },
    { id: "R01", priority: 3, type: "receivable", entity: "personal", counterparty: "Example Opco", description: "Reimbursement", amount: 300, currency: "CAD", due_date: "2026-12-31", due_note: "", status: "accrued", last_checked: "2026-10-19" },
  ],
  cabin: {
    last_statement_month: "2026-09",
    nights: 11,
    gross_cad: 2500,
    sales_taxes_cad: 200,
    deposit_cad: 1200,
    net_ex_tax_cad: 950,
    t12: { nights: 120, gross_cad: 30000, net_ex_tax_cad: 11000, owner_costs_cad: null, interest_cad: null, noi_cad: null },
    statements_on_file: 9,
  },
  books: {
    suspense_cad: -1234.5,
    trial_balance_cad: 0,
    balanced: true,
    tieouts: { ties: 40, fails: 2, other: 3 },
    due_from_ensemble_cad: 2500,
    as_of: "2026-10-15",
  },
  open_items: { to_clarify_open: 12, batches: 2, open_questions: 3, oldest_open: "2026-09-20", next_question_id: 24 },
  contract: { version: "2.0.0", hash: "0123456789ab", required: ["Agent A", "Agent B", "Agent C"], acked: ["Agent A", "Agent C"], grace_until: "2026-10-19" },
  sources: { "ledger.csv": "2026-10-18", "debts.csv": "2026-09-30", "facts.json": "2026-10-10", "holdings.csv": "2026-09-30", t30d: "rebuilt from ledger" },
});
