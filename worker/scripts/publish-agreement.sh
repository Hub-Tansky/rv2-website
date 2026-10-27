#!/usr/bin/env bash
# Publishes a map submission agreement version (ADR 0002): uploads the text to the bucket under its SHA-256 and
# points worker/wrangler.toml at it. The text itself never goes into this repository.
# Usage: worker/scripts/publish-agreement.sh <agreement.txt> <version label, e.g. 1.0>
# Then commit worker/wrangler.toml; the merge to main deploys it and the form opens with this version.
set -euo pipefail
file=${1:?agreement text file}
version=${2:?version label}
cd "$(dirname "$0")/.."
case "$file" in /*) ;; *) file="$OLDPWD/$file" ;; esac
hash=$(shasum -a 256 "$file" 2>/dev/null | cut -c1-64 || sha256sum "$file" | cut -c1-64)
npx --yes wrangler@4.153.0 r2 object put "rv2-map-submissions/agreements/$hash.txt" --file "$file" --content-type 'text/plain; charset=utf-8' --remote -J eu
sed -i.bak -e "s/^AGREEMENT_SHA256 = .*/AGREEMENT_SHA256 = \"$hash\"/" -e "s/^AGREEMENT_VERSION = .*/AGREEMENT_VERSION = \"$version\"/" wrangler.toml && rm wrangler.toml.bak
echo "Agreement $version uploaded as agreements/$hash.txt; worker/wrangler.toml updated. Commit and merge it to open the form."
