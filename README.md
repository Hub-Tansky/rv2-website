# Robo Violence 2: website

The static site at https://roboviolence.com, deployed to GitHub Pages from `main`. The game itself lives in [Hub-Tansky/RoboViolence2](https://github.com/Hub-Tansky/RoboViolence2); this repository was split out of it with its history ([ADR 0001](docs/decisions/0001-website-in-its-own-repository.md)).

## Work on it

- Edit the pages in `website/`. No build step for them: Tailwind comes from its CDN with `website/theme.js` ([ADR 0035](docs/decisions/0035-website-tailwind-install-page-agent-files.md)).
- Docs pages come from the vault (Hub-Tansky/rv2-docs, `10-public/`) at deploy time ([ADR 0004](docs/decisions/0004-docs-pages-built-from-the-vault.md)). Preview: `npm ci`, `cp -r website _site && node tools/build-docs.mjs <path to 10-public> _site`, then `python3 -m http.server -d _site`.
- After any page change: `node tools/website-markdown.mjs` (rewrites the `<page>.md` copies; the tests fail on a stale copy).
- Test: `npm ci`, then `node --test tests/website/site.test.mjs worker/test/worker.test.mjs` (Node 22). It downloads the game's `build.yml`; offline, point `RV2_BUILD_YML` at a local copy.
- Preview: open `website/index.html`, or `python3 -m http.server -d website`.
- `pages.yml` tests every PR and push, deploys `main`, and runs daily so a release file rename in the game repository shows up here.

## Files

| path | purpose |
|---|---|
| `website/index.html` | Landing page: hero with the OS-detected download button, features, start steps, community links, status hook, VideoGame JSON-LD (ADR 0029, 0035) |
| `website/install.html` | Install guide: download button with version and size, original data steps, requirements, downloads list, per-OS steps (ADR 0035) |
| `website/about.html` | What the game is; credits to BaboViolent 2 |
| `website/privacy.html` | Privacy policy (GDPR): data processed by the game, servers and website, legal basis, hosting, retention, rights (RoboViolence2 ADR 0034) |
| `website/server.html` | Hosting your own game server (summary of the game's `docs/ops/runbook.md`) |
| `website/submit-map.html` | Map submission form: Discord sign-in, `.bvm` upload, third-party asset disclosures, agreement acceptance, receipt (ADR 0003) |
| `website/submit-map.js` | Drives the form against the submission service at submit.roboviolence.com; loads Turnstile only after sign-in |
| `website/site.js` | Download button and list from the GitHub releases API, Discord invite constant, mobile menu, icons, `/#install` redirect, contact address assembled from `data-mail` attributes |
| `website/theme.js` | Tailwind Play CDN theme for every page: palette, layout steps, page chrome and shared component classes (ADR 0035) |
| `website/*.md` | Markdown copies of each page for AI agents, from `tools/website-markdown.mjs` |
| `website/robots.txt` | Crawl rules: AI search and training crawlers named and allowed, Content Signals in every group, sitemap address (ADR 0035) |
| `website/sitemap.xml` | Every page's canonical address (the tests check it) |
| `website/llms.txt` | Summary and Markdown page links for AI agents (llmstxt.org) |
| `website/img/` | `hero.webp` placeholder hero, `og.png` link preview (1200x630), `rv2-icon.png` app icon v2 (menu logo, Apple touch icon, linked from elsewhere: keep the URL), `favicon.svg` |
| `worker/` | The map submission service, a Cloudflare Worker with R2 and D1 (ADR 0003): `src/` code, `migrations/` D1 schema, `test/` tests, `scripts/` one-time setup and agreement publishing |
| `docs/ops/map-submissions.md` | Setting up, reviewing and operating map submissions |
| `.github/workflows/worker.yml` | Tests the Worker on PRs; applies migrations and deploys it from `main` (ADR 0003) |
| `tools/website-markdown.mjs` | Writes `website/<page>.md` from each page's `<main>` |
| `tools/build-docs.mjs` | Builds `docs.html`, `docs/<slug>.html` and `.md` copies from the vault's `10-public/` into the deployed copy (ADR 0004) |
| `tests/website/docs-fixture/` | Sample vault notes for the docs build test |
| `package.json`, `package-lock.json` | The one build dependency, `marked`, at an exact version |
| `tests/website/site.test.mjs` | Installer per OS against the asset names in the game's `build.yml`, OS detection, newest release incl. pre-releases, button offer and fallback, shared chrome, privacy contact, CDN and canonical tags, sitemap, robots.txt, Markdown copies, JSON-LD |
| `.github/workflows/pages.yml` | Tests on PRs, pushes and daily; deploys `website/` plus the docs built from rv2-docs to GitHub Pages from `main`, also on "Run workflow" and `repository_dispatch` `docs` (ADR 0029, 0001, 0004) |
| `docs/decisions/` | Website ADRs ([index](docs/decisions/README.md)) |
| `AGENTS.md` | Rules for coding agents |
| `LICENSE.txt` | GPL-3.0, as the game |

## Hosting

Map submissions run on Cloudflare (Worker at `submit.roboviolence.com`, R2 and D1 in the EU jurisdiction): setup and review in [docs/ops/map-submissions.md](docs/ops/map-submissions.md).

Pages source "GitHub Actions", custom domain `roboviolence.com` with Enforce HTTPS. DNS is at Cloudflare (DNS only): apex A/AAAA records to GitHub Pages and `www` CNAME `hub-tansky.github.io`; the Pages domain is verified on the account, so no `CNAME` file is needed.
