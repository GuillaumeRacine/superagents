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
