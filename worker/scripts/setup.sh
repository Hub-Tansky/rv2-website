#!/usr/bin/env bash
# One-time creation of the map submission service's Cloudflare resources (ADR 0002, docs/ops/map-submissions.md).
# Run from the repository root on a computer where `npx wrangler login` has been done. Safe to re-run: steps that
# already happened fail with "already exists" and the script goes on.
set -uo pipefail
cd "$(dirname "$0")/.."
W="npx --yes wrangler@4.153.0"
NAME=rv2-map-submissions

step() { printf '\n== %s\n' "$*"; }

step "R2 bucket in the EU jurisdiction"
$W r2 bucket create "$NAME" -J eu

step "Bucket locks: files can't be deleted or overwritten while locked"
$W r2 bucket lock add "$NAME" submissions-1y submissions/ --retention-days 365 -J eu -y
$W r2 bucket lock add "$NAME" accepted-forever accepted/ --retention-indefinite -J eu -y
$W r2 bucket lock add "$NAME" agreements-forever agreements/ --retention-indefinite -J eu -y
$W r2 bucket lock add "$NAME" backups-30d backups/ --retention-days 30 -J eu -y
$W r2 bucket lifecycle add "$NAME" backups-35d backups/ --expire-days 35 -J eu -y

step "D1 database in the EU jurisdiction"
if grep -q 'database_id = "00000000-0000-0000-0000-000000000000"' wrangler.toml; then
  id=$($W d1 create "$NAME" --jurisdiction eu 2>&1 | tee /dev/stderr | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -n "$id" ]; then
    sed -i.bak "s/00000000-0000-0000-0000-000000000000/$id/" wrangler.toml && rm wrangler.toml.bak
    echo "database_id $id written to worker/wrangler.toml: commit it."
  else
    echo "Could not read the database ID. Run: $W d1 list, and put the ID into worker/wrangler.toml." >&2
    exit 1
  fi
fi
$W d1 migrations apply "$NAME" --remote

step "First deploy (the form stays closed until an agreement is published)"
$W deploy

step "Secrets"
openssl rand -base64 48 | $W secret put SESSION_SECRET
for s in DISCORD_CLIENT_SECRET TURNSTILE_SECRET_KEY ADMIN_EMAILS REVIEW_WEBHOOK_URL; do
  echo "Value for $s (paste, then Enter; empty skips):"
  read -r value
  [ -n "$value" ] && printf '%s' "$value" | $W secret put "$s"
done

printf '\nDone. Next: the remaining steps in docs/ops/map-submissions.md (Discord app, Turnstile, Access, agreement).\n'
