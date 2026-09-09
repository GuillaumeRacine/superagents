# Super Agents Documentation

The searchable, sanitized system map for Gui's complete agentic operating environment.

The portal documents runtimes, capabilities, repositories, devices, data sources, context, automation, governance, workflows, recovery, and canonical sources. It is a **derived index**: runtime repositories, the private Context control plane, the private knowledge vault, GitHub, and deployed surfaces remain authoritative for their own state.

## Canonical surfaces

- Website: [superagents-docs.vercel.app](https://superagents-docs.vercel.app)
- Source and issues: [GuillaumeRacine/superagents](https://github.com/GuillaumeRacine/superagents)
- Previous GitHub links redirect to this repository. The old Vercel hostname remains a compatibility redirect.

## Local development

Requirements: Node.js 20.9 or newer.

```bash
npm ci
npm run docs:generate
npm run check
npm run dev
```

The rendered site uses Google OAuth through Auth.js and fails closed unless all
of `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, and
`AUTHORIZED_GOOGLE_EMAIL` are configured. The sign-in callback accepts only a
Google-verified email that exactly matches `AUTHORIZED_GOOGLE_EMAIL`; the proxy
rechecks the session email on every protected request.

## Documentation changes

1. Update the owning source first.
2. Edit `config/system-registry.json` for changed public facts.
3. Run `npm run docs:verify-live` on the owning workstation. Run `npm run docs:audit-estate` when repository, device, or data-source coverage changes.
4. Run `npm run docs:generate`; do not hand-edit generated pages.
5. Run `npm run check` and `npm run build`.
6. Review the rendered navigation, search, responsive layout, and access gate.
7. Commit, push, deploy, live-verify, and record proof in GitHub.

## Publication boundary

The source repository is public. Keep the current tree sanitized even though rendered routes on Vercel also require an allowlisted Google session. The client-side search index remains public so its browser worker can load reliably. CI checks catch common publication mistakes and secrets, but human review owns the final decision. Legacy history predates these controls and is explicitly tracked for remediation in [GitHub issue #4](https://github.com/GuillaumeRacine/superagents/issues/4).
