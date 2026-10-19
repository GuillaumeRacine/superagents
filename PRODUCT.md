# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and jobs

- **Primary user: Gui**, owner-operator of a one-person, many-agent company, on phone and desktop, usually between other things. The single allowlisted Google account is the only human reader (confirmed 2026-10-19).
- **Job on `/dashboard`:** read the state of his money and his business in under a minute, see what needs a decision this week, and trust that every number says where it came from and when. Operate mode: a task, not a brochure.
- **Job on the documentation:** find how the agent system is wired (runtimes, capabilities, context, automation, governance, recovery) and what is proven versus merely installed. Read mode.
- **Agents** (Chief of Cash, Hermes jobs, Claude and Codex sessions) do not read the site; they read the private repositories the site is built from. The site is a derived index.

## Purpose and position

Super Agents is the navigation layer and private operating console for Gui's complete agentic operating system. It is a **derived, sanitized index**: GitHub, the private Context control plane, the private vault, and each runtime stay authoritative. The site's own promise is that observation dates and sources are always visible and that nothing unproven is shown as a fact.

Mechanism that is meaningfully different: every figure on a dashboard carries its own as-of date and source; unknown stays "unknown" (never 0); balances are never summed across entities or currencies; staleness is computed at render against a rule, not hidden.

## Surfaces

- `/dashboard` (private): hub plus three agent-owned dashboards. **Cash** (owner: Chief of Cash, weekday feed, record of truth `Context/cfo-feed`), **Invest** (owner to assign; interim monthly run), **Business** (founder overview). Served at `iamgui.com/dashboard` and at the Vercel hostname.
- Documentation (gated, public-source): Nextra site at `superagents-docs.vercel.app`; the Markdown corpus and `llms.txt` are public agent exports.
- `iamgui.com/` itself stays the public one-page personal site (separate project, proxied unchanged); this product owns only the host's private section.

## Constraints

- Public repository: no credentials, personal context, private URLs, absolute home paths, customer data or recovery shortcuts in the source (`AGENTS.md`, `scripts/check-docs.mjs`).
- Private data reaches the site only as managed-environment snapshots (gzip variants), capped by Vercel's 64 KB env budget; pages are dynamic, no-store, noindex, behind an exact-email allowlist rechecked on every request.
- Naming contract: the product is **Super Agents**, slug `superagents`; the former name never reappears (`/governance/naming`).
- Stack: Next.js 16 app router, Nextra 4 docs theme, Auth.js v5 Google provider, CSS modules for custom pages; Node 20.9+.
- Accessibility floor: WCAG AA contrast, visible focus, keyboard-complete, `prefers-reduced-motion` honoured, 44 px touch targets on phone.

## Terminology

- "as of" = observation date of a figure; "snapshot built" = when the env value was generated; "rendered" = request time.
- "unknown" = no proving document on file; never shown as 0.
- "stale" = snapshot older than 36 h, or burn, scorecard or feed post older than 3 days.
- "cover" = named entity's CAD cash minus open tax claims minus planned funding.
- Entities: Stoic (holding), Ensemble Ventures (operating), personal; never summed.

## Evidence and assets

- No logo beyond the "Super Agents" wordmark in the navbar; the personal site's brand assets belong to the one-pager and are not reused here.
- Proof lives in GitHub issues (plan, PROOF blocks, screenshots) and `docs/LEARNINGS.md`.

## Open decisions

- Invest dashboard owner (agent) is unassigned; Context#151 names the interim.
- Whether the docs pages should also be reachable on iamgui.com (today: redirect to the Vercel hostname) is Gui's call; default is no.
