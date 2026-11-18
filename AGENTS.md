# Super Agents Docs Agent Instructions

- Read `README.md`, `REPO_MANIFEST.md`, and `config/system-registry.json` before material changes.
- This public repository is a sanitized derived index, never a credential store or replacement for private runtime truth.
- Put volatile counts and versions only in the JSON registries. Run `npm run docs:verify-live` on the owning workstation, then `npm run docs:generate`.
- Do not publish personal context, private URLs, absolute home paths, customer data, or destructive recovery shortcuts.
- Before shipping, run `npm run check` and `npm run build`, review the rendered site, then complete the GitHub/deploy/live-proof loop.

## Canonical Naming

- The product and system umbrella is **Super Agents**. Use that exact two-word, title-case form in prose and interface copy.
- The canonical machine slug is `superagents`. The GitHub repository and Vercel project must both use this slug.
- The canonical production hostname is `superagents-docs.vercel.app`.
- Never introduce `InnerOS`, `inneros`, or `inner-os` into an active project name, domain, deployment alias, branch, environment variable, package, route, or new documentation title.
- The former name may appear only in an explicitly historical record or while removing a legacy identifier. Do not preserve compatibility aliases unless Gui explicitly requests one.
- Before shipping naming-related work, search the complete current tree and verify the GitHub repository, Vercel project, production aliases, and live page metadata against this contract.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- clear-writing:begin -->
## Writing standard: ASD-STE100 house style (default for every agent)

Skill `clear-writing`: `~/Workspace/Write/Resources/clear-writing/SKILL.md` on
Gui's Macs, or https://github.com/GuillaumeRacine/workspace/blob/main/Write/Resources/clear-writing/SKILL.md
Every agent writes in Gui's house standard based on ASD-STE100 (Simplified
Technical English). It is the default for all agentic work: replies, reports,
documents, slides, emails, issue and PR text, Slack posts, prompts, skills,
workflow templates, interface, store and email copy. Load the skill for
substantial text and apply these rules always:
- Lead with the point. Use familiar, concrete words and one term per concept.
- Use active voice and direct verbs. One idea per sentence (about 15-25 words).
- Procedures: condition first, one action per step, warning before the action.
- Keep numbers, dates, scope and uncertainty exact. Never invent a fact.
- Use approved product terms exactly (for Present: LANGUAGE.md section 1). No
  banned words, and no evaluative words (perfect, seamless, thoughtful) for a
  product, a result or your own work.
Exception (Gui, 2026-11-18): marketing copy and blog writing (Substack, social
posts, ads, newsletters, the narrative of a landing page) may be subjective and
less precise and ignore the word lists. Names, labels, claims, privacy and
positions stay fixed there too. Lint those with `copy_lint.py --register
expressive`. Public text also follows `public-writing`. Pass this standard to
every delegated writer. It is a house standard, not formal STE compliance.
<!-- clear-writing:end -->
