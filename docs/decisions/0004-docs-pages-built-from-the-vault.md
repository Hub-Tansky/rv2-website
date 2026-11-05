# 0004: Docs pages are built from the Robo2-docs vault at deploy time

- Status: Accepted
- Date: 2026-11-05
- Affects: `tools/build-docs.mjs`, `.github/workflows/pages.yml`, the menu on every page, `package.json`; amends ADR 0035 (first build step)

## Context
- The owner writes player docs (install, hosting, FAQ, console commands) in the Obsidian vault Robo2-docs, the private repo Hub-Tansky/rv2-docs, folder `10-public/` (RoboViolence2 ADR 0044). Notes use plain Markdown links, so they render without Obsidian.
- Owner, 2026-11-05 (thread "Plan docs and backlog move to Obsidian"): the docs must refresh whenever the website deploys, and a manual run must be possible.

## Decision
`pages.yml` checks out `10-public/` of rv2-docs with a read-only deploy key (secret `RV2_DOCS_DEPLOY_KEY`), and `tools/build-docs.mjs` writes `docs.html` (list by `order`, then title), `docs/<slug>.html` with the site chrome taken from `about.html`, `docs/<slug>.md` copies, `docs/_attachments/`, and adds them to `sitemap.xml` and `llms.txt` in the deployed copy. Markdown is rendered by `marked` (exact version in `package.json`). Notes with `draft: true` are left out. Nothing built is committed.

## Consequences
- Any deploy (push to `main`, "Run workflow", or a `repository_dispatch` of type `docs`) shows the vault's current docs.
- Without the secret the site still deploys, with "No articles yet." on docs.html.
- The site now has one npm dev dependency; `npm ci` runs in both jobs.
- Rejected: copying the docs into this repo by a script on the Mac (two copies, needs the Mac online); rendering Markdown in the browser (no content for crawlers and agents without JavaScript).
