# Learnings

Canonical log of decisions, wins, fails and incidents for this repo. Newest on top.

## Recent Lessons

- Vercel injects at most 64 KB of env into a function: store each managed snapshot once, as the gzip variant, and check the total before adding. "Sensitive" variables can never be read back.
- Assert on server-rendered HTML with one text node per value: React SSR puts `<!-- -->` between adjacent text children, so `CAD {n}` is not `CAD 83,000` in the HTML.
- `scripts/check-docs.mjs` forbids absolute home paths in every text file (docs, scripts, this log): use `os.homedir()` in scripts and relative paths in docs.
- Validate a snapshot twice: build → validate → serialize → validate. The normalized shape must be accepted by its own validator.
- Loop over shell commands from a `#!/bin/bash` script file, not from the agent's zsh (unquoted `$step` is not word-split there).

## 2026-10

### [2026-10-19] INCIDENT->FIX Vercel 64 KB environment limit blocked the merge deployment
- **Context:** `CASH_SNAPSHOT_JSON` (15.6 KB) was refused with "total size of all Environment Variables (73.98KB) exceeds 64KB"; the gzip variant (5.8 KB) was accepted, but the merge deployment for 6c528c0 then failed with `env-vars-limit` because the total was still over the 64 KB injected into a function.
- **What we tried:** Back up `FINANCE_SNAPSHOT_JSON` before removing it. `vercel env pull` and the `/v9/projects/:id/env?decrypt=true` API both return nothing for it: the finance and business snapshot variables were created as the "sensitive" type, which is write-only forever. The API `decrypt` read of an ordinary encrypted variable returns Vercel's at-rest envelope (`{"v":"v2","c":...}`), not the value, so a 19 KB readback of a 5.8 KB upload is not corruption.
- **Outcome:** Removed `FINANCE_SNAPSHOT_JSON` (dead config: `lib/snapshot-transport.mjs` never reads the JSON variable while the gzip variable exists, with no fallback), created the production deployment of the exact merge commit through `POST /v13/deployments` with `gitSource` (no empty commit), READY in ~50 s and aliased to superagents-docs.vercel.app.
- **Lesson / rule:** Store each snapshot once, as the gzip variant, and budget the project's env total against 64 KB before adding one. Sensitive-type variables cannot be backed up from Vercel; keep the regeneration path (builder script + private source) documented instead. A deployment can fail at creation with no deployment object at all; the GitHub commit status then points at a docs link, not a build log.
- **Links:** #44, PR #46, deployment dpl_G8hd28LzzxqjmMhfbiGeVF1Y7TJK.

### [2026-10-19] DECISION Finance split into /cash and /invest (issue #44)
- **Context:** Gui's ruling: two agent-owned dashboards replace the single `/finance`; Cash first because the Chief of Cash feed already runs daily.
- **What we tried:** `/cash` as a server-rendered page (business-dashboard pattern) over a `cash_snapshot_v1` built from the private `Context/cfo-feed` checkout; `/invest` mounts the existing 1,500-line workspace unchanged with new header props; `/finance` becomes a hub. The gzip/JSON transport was factored into `lib/snapshot-transport.mjs` and reused by both loaders.
- **Outcome:** All gates green locally (test:business, test:finance, test:cash, docs:check, build, smoke, verify-business, verify-finance, verify-cash). Funding targets are parsed from `TARGETS.md` section 1 at build time so no private amounts live in public code; the one CRA notice without an `amount_cad` field gets its amount parsed from the notice text and is labelled as such on the page.
- **Lesson / rule:** Keep the no-sum rule in the model, not the page: `entityCash` takes one entity and one currency, `stoicCover` reads the named entity only, and the test asserts no export name looks like a cross-entity total. Null stays null everywhere (`"" → null`, never 0); the cover goes unknown if any input is unknown.
- **Links:** #44, Context#172 (Chief of Cash handoff), Context#151 (Invest interim owner).

### [2026-10-19] FAIL->FIX verify-cash false negatives
- **Context:** First run of `scripts/verify-cash.mjs` failed twice for reasons unrelated to the gate.
- **What we tried:** (1) `new URL(location)` threw on Next's relative `Location: /api/auth/signin?...`; pass `base` as the second argument. (2) `html.includes("CAD 83,000")` failed because the `Money` component rendered `{currency} {n}` as separate text nodes and SSR emitted `CAD <!-- -->83,000`.
- **Outcome:** Both fixed; `Money` now emits a single template string, which also makes the HTML cleaner.
- **Root cause:** Assertions written against the JSX, not the HTML the server actually sends.
- **Lesson / rule:** When a gate asserts on rendered markup, read the markup once (`curl` or a saved body) before writing the expected strings.

### [2026-10-19] FAIL->FIX builder snapshot did not round-trip
- **Context:** `build-cash-snapshot.mjs` validated the raw object fine, but `readCash(JSON.stringify(validated))` returned `invalid`.
- **Root cause:** `validateBurn` normalized `accountsLastDate` from `{name: date}` to `[[name, date]]`, and the validator only accepted the object form.
- **Lesson / rule:** The builder's round-trip assertion (validate → stringify → readCash must be `ready`) is cheap and caught a bug that would have shipped an env value the site rejects. Keep it.

### [2026-10-19] LESSON screenshot review tooling
- `sips --cropOffset` did not crop from the requested offset (returned the page middle twice); PIL `Image.crop` did. Tall full-page screenshots need splitting before review or the text is unreadable.
- Tables on a 390px viewport: give `.table` a `min-width` and let `.tableWrap` scroll instead of letting every cell wrap one word per line.
