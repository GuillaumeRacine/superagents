# Super Agents Docs Agent Instructions

- Read `README.md`, `REPO_MANIFEST.md`, and `config/system-registry.json` before material changes.
- This public repository is a sanitized derived index, never a credential store or replacement for private runtime truth.
- Put volatile counts and versions only in the JSON registries. Run `npm run docs:verify-live` on the owning workstation, then `npm run docs:generate`.
- Do not publish personal context, private URLs, absolute home paths, customer data, or destructive recovery shortcuts.
- Before shipping, run `npm run check` and `npm run build`, review the rendered site, then complete the GitHub/deploy/live-proof loop.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
