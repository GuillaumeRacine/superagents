# Repository Manifest

## Purpose

Canonical website and sanitized derived index for Gui's multi-agent operating system.

## Authority

- This repository owns the portal's navigation, explanatory content, publication policy, and public registry snapshot.
- `config/system-registry.json` owns volatile facts published by the site.
- Each runtime, private system repository, and deployed surface remains authoritative for its live behavior.

## Inputs

Reviewed runtime inventories, private Context evidence, private vault policy, official platform documentation, and live deployment checks.

## Outputs

A Nextra website, generated system registry, CI evidence, deployment, and GitHub closeout record.

## Data classification

Public, sanitized architecture and operating metadata only. No credentials, personal context, private URLs, customer data, or machine-specific recovery commands.

## Validation

`npm run check` validates registry drift and freshness, navigation, routes, internal links, publication rules, and high-severity production dependencies. CI runs a separate Gitleaks scan. `npm run build` validates the production application.
