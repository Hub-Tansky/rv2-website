# Map submissions: setup and operation

The form is `website/submit-map.html` (https://roboviolence.com/submit-map.html). The service behind it is the Cloudflare Worker in `worker/` at https://submit.roboviolence.com ([ADR 0003](../decisions/0003-map-submissions-on-a-cloudflare-worker.md)). Until an agreement version is published (step 7), the page says "Map submissions are not open yet".

## One-time setup (about 30 minutes)

1. **Discord app.** At https://discord.com/developers/applications: New Application, name "Robo Violence 2 maps". Under OAuth2, add the redirect `https://submit.roboviolence.com/auth/callback`. Copy the Client ID into `DISCORD_CLIENT_ID` in `worker/wrangler.toml`; keep the Client Secret for step 4. No bot and no other scopes are needed.
2. **Turnstile.** In the Cloudflare dashboard, Turnstile, Add widget: hostname `roboviolence.com`, mode Managed. Copy the site key into `TURNSTILE_SITE_KEY` in `worker/wrangler.toml`; keep the secret key for step 4.
3. **Review notices (optional).** In a private Discord channel only you can see: Edit Channel, Integrations, Webhooks, New Webhook. Keep its URL for step 4. Each new submission posts its ID, title, credit name and a review link there.
4. **Resources and secrets.** On the Mac, in the repository root: `npx wrangler@4.153.0 login`, then `worker/scripts/setup.sh`. It creates the R2 bucket and the D1 database in the EU jurisdiction, adds the bucket locks and the backup expiry, writes the database ID into `worker/wrangler.toml`, applies the migrations, deploys once and asks for the secrets: `DISCORD_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `ADMIN_EMAILS` (the address you sign in to Cloudflare Access with; comma-separated for several) and `REVIEW_WEBHOOK_URL` (empty skips). `SESSION_SECRET` is generated.
5. **Review pages.** Cloudflare dashboard, Zero Trust, Access, Applications, Add, Self-hosted: domain `submit.roboviolence.com`, path `admin`; policy Allow, Include Emails, your address; login method One-time PIN is enough. From the application's Overview copy the Application Audience (AUD) tag into `ACCESS_AUD`, and your team domain (`<team>.cloudflareaccess.com`) into `ACCESS_TEAM_DOMAIN`, both in `worker/wrangler.toml`.
6. **Deploys from GitHub.** Cloudflare dashboard, My Profile, API Tokens, Create Token from the "Edit Cloudflare Workers" template, then add Account, D1, Edit. In this repository, Settings, Secrets and variables, Actions: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (from the Workers overview page). Commit `worker/wrangler.toml` with the IDs from steps 1, 2, 4 and 5 and merge it: `worker.yml` applies migrations and deploys on every merge to `main`.
7. **Open the form.** Once counsel approved the agreement: save the final text as a plain `.txt` file outside this repository (it must never be committed here), then `worker/scripts/publish-agreement.sh /path/to/agreement.txt 1.0`. Commit and merge the `worker/wrangler.toml` change. The form opens with that version.
8. **Test it yourself.** Submit one of your own maps, open `https://submit.roboviolence.com/admin`, check that the files say "matches", set it to `rejected` with the note "test", and open "Check event chain".
9. **Announce.** Post https://roboviolence.com/submit-map.html in Discord.

## Reviewing

- `/admin` lists submissions with their latest status. A submission page shows the record, the files with a fresh SHA-256 check, the history and a form to add an event: `in_review`, `needs_info` (ask on Discord, the user ID is in the record), `accepted`, `rejected`, `taken_down`. Nothing is ever edited; each change is a new event with your Access address as the actor.
- Assets without evidence are flagged in the list and in the first event. Check them before accepting.
- `accepted` copies the map, the evidence and the record to `accepted/`, which the bucket keeps indefinitely. Put the map into the game by hand from the download link.
- Takedown: add `taken_down` with the reason, then remove the map from the game and the servers. The records stay: they are the licence history.

## Requests from contributors

- Access or copy of their data: "Export everything for this contributor" on any of their submissions gives the JSON.
- Correcting the credit name: add a `needs_info` or `in_review` event noting the new name, and use it when publishing. The submitted snapshot stays as it was.
- Erasure before acceptance or after rejection: add `rejected` with the note "withdrawn by contributor". The nightly job deletes it one year after it arrived (the bucket lock does not allow earlier). Accepted maps keep their records while the map is distributed (privacy policy, section 8).

## Changing the agreement

Publish the new text with `publish-agreement.sh` and a new version label, commit and merge. Open forms then fail with "The agreement changed while the form was open", which is intended. Old texts stay in `agreements/` and every record keeps the hash it accepted.

## Recovery and checks

- Nightly at 03:23 UTC the Worker copies both tables to `backups/d1-<date>.json` (kept 35 days) and deletes expired rejected submissions. D1 Time Travel can also restore the database to a point in the last days: `npx wrangler@4.153.0 d1 time-travel restore rv2-map-submissions --timestamp <ISO time>`.
- "Check event chain" on `/admin` recomputes every record hash and event chain. A break means a row was changed outside the Worker.
- Cost: everything fits the free plans. If the Worker logs "exceeded CPU" on large evidence uploads, switch to Workers Paid (USD 5 a month).
