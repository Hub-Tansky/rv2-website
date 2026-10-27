# 0002: Map submissions go through a Cloudflare Worker with Discord sign-in, R2 and D1

- Status: Accepted
- Date: 2026-10-27
- Affects: `website/submit-map.html`, `website/submit-map.js`, `worker/`, `.github/workflows/worker.yml`, `website/privacy.html` (Map submissions), runbook `docs/ops/map-submissions.md`

## Context
- Owner decision 2026-10-27 (project thread "Plan map submission form"): a real map submission form, with a link to post on Discord, on the Cloudflare option.
- The owner's map submission handoff (private, not in any repository) requires a signed-in account with a stable ID, the exact file bytes with a server-side SHA-256, the exact agreement text and version accepted, a server UTC timestamp, third-party disclosures with evidence, an append-only review trail, export and takedown.
- GitHub Pages serves static files only; the domain is already on Cloudflare; the hosting cap is EUR 10 a month (ADR 0029). Most players are on Discord, few have GitHub accounts.
- Original BaboViolent 2 maps are 212 B to 6.2 kB; the largest map the game reads (256 x 256 cells) is about 131 kB.

## Decision
The form is a static page on roboviolence.com. A Worker at submit.roboviolence.com signs players in with Discord (`identify` scope only), checks Turnstile, reads the `.bvm` header like the game does, hashes every file, stores files and a canonical-JSON record in R2 (EU jurisdiction, bucket locks), and indexes them in D1 (EU), where triggers make the tables append-only and each submission's events form a SHA-256 chain starting from its record's hash. The owner reviews at `/admin`, behind Cloudflare Access plus an in-Worker JWT check. The agreement text is stored only in R2 under its SHA-256, which is its version ID in every record.

## Consequences
- Expected cost EUR 0 on the free plans (Workers 100k requests a day, R2 10 GB, D1 5 GB, Turnstile, Access up to 50 users). If evidence uploads exceed the free plan's 10 ms CPU per request, Workers Paid (USD 5 a month) fits the cap.
- Rejected submissions are deleted by the nightly job one year after arrival (the `submissions/` lock period); accepted ones are copied to `accepted/`, locked indefinitely. A `purges` row records each deletion.
- The form only opens once `AGREEMENT_SHA256` is set: the final agreement text, approved by counsel, is uploaded by the owner (runbook). Changing the text means a new hash and version; old records keep theirs.
- Turnstile is a new third party for signed-in visitors only; the privacy policy names it.
- Rejected: Tally and similar form services (no stable account, no immutable record); GitHub issue forms (attachments in public repositories are public, most players lack GitHub accounts); an app on the game VPS (puts uploads on the game host; the owner preferred Cloudflare).
