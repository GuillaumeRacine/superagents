# InnerOS Docs

The searchable, sanitized system map for Gui's multi-agent operating environment.

The portal documents runtimes, capabilities, context, automation, governance, workflows, recovery, and canonical sources. It is a **derived index**: runtime repositories, the private Context control plane, the private knowledge vault, GitHub, and deployed surfaces remain authoritative for their own state.

## Local development

Requirements: Node.js 20.9 or newer.

```bash
npm ci
npm run docs:generate
npm run check
npm run dev
```

The rendered site fails closed unless both `DOCS_USER` and `DOCS_PASSWORD` are configured.

## Documentation changes

1. Update the owning source first.
2. Edit `config/system-registry.json` for changed public facts.
3. Run `npm run docs:verify-live` on the owning workstation, then `npm run docs:generate`; do not hand-edit generated pages.
4. Run `npm run check` and `npm run build`.
5. Review the rendered navigation, search, responsive layout, and access gate.
6. Commit, push, deploy, live-verify, and record proof in GitHub.

## Publication boundary

The source repository is public. Keep it sanitized even though rendered routes on Vercel also require basic authentication. The client-side search index remains public so its browser worker can load reliably. CI checks catch common publication mistakes and secrets, but human review owns the final decision.
