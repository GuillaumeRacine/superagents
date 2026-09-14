# Business Dashboard

Source of truth for this capability: this guide and issue #30. Intent:
[lean ISA](ideal-state.md). Native repositories still own business evidence.

## Private boundary

The dynamic `/business` page and `/api/business` call a server-only data layer
which rechecks the existing exact-email allowlist on every request. Neither
private data nor the mapping belongs in public MDX, static configuration, tests,
Pagefind or the documentation export. Public tests use fictional businesses.

The first adapter accepts a bounded `BUSINESS_SNAPSHOT_JSON` server-side managed
environment value (maximum 48 KB). This is a temporary deployment snapshot,
not a live database or source authority. Its private, versioned original must
be retained in the private control plane. Refresh requires a reviewed snapshot
and redeployment; loading the page does not collect fresh business evidence.
No broad GitHub credential is installed on the docs host.

Projection discards unknown fields. Links are HTTPS GitHub evidence links only.
Metrics preserve null, unit, period and definition. A 48-hour display freshness
threshold is a provisional operational default, not a business-health threshold.
Future timestamps beyond five minutes are unknown. Native outcome status is
displayed separately from issue closure. Proposed objectives remain provisional.

## Release gates

1. `npm run test:business`, `npm run check`, `npm run build`.
2. Test valid, missing, expired, invalid and disallowed sessions and mobile UI.
3. Verify real Google OAuth on production and public export/search exclusion.
4. Only then install private snapshot. Never use a fabricated production session
   as a substitute for the OAuth proof. Keep private activation blocked if needed.
5. Read back the authenticated result, compare observations, and record proof.

Unconfigured and malformed configurations show safe non-sensitive empty states.
No write actions or schedule are installed. Hermes owns any future collector
cadence, which requires its own implementation and proof.

## Multiple Google accounts

Dashboard readers and source connectors are separate permission sets. Connecting
an additional Gmail or Workspace data account does not add that account to the
dashboard sign-in allowlist. Each future connector needs an explicit account,
business mapping, minimum scopes, consent, revocation and collection coverage.
Do not use domain wildcards. Reader additions require exact owner-specified
addresses and a separate authorization test. No Gmail/Workspace data connector
or expanded reader permission is included in this release.

## Rollout and rollback

- #31: authorization and projected read model.
- #32: responsive overview and evidence detail.
- #33: production verification and activation.
- Later: repair collectors, connect live sources, expand coverage, then controlled
  edits. Do not interpret this list as authorization to grant new permissions.

Rollback: remove the snapshot environment value and redeploy, or roll back the
application deployment. Private source records are never deleted by this app.
