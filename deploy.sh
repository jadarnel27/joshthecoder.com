#!/usr/bin/env bash
# Publish joshthecoder.com to Cloudflare: a production Jekyll build, then upload _site/ (replaces the live site).
#   ./deploy.sh
# Asks for your Cloudflare API token (typing is hidden) unless CLOUDFLARE_API_TOKEN is already set.
# The token only lives in this script's memory. It isn't saved to disk or shell history, and it's gone when
# the script ends. No account ID is needed: the token belongs to one Cloudflare account and wrangler finds it.
set -euo pipefail
cd "$(dirname "$0")"

# The live site will match the files in this folder, so say so if they aren't what's committed on master.
branch=$(git rev-parse --abbrev-ref HEAD)
changes=$(git status --porcelain -- . ':(exclude)_drafts')   # drafts are never published, so ignore them
if [ "$branch" != master ] || [ -n "$changes" ]; then
  [ "$branch" != master ] && echo "Note: you're on branch '$branch', not master."
  [ -n "$changes" ] && { echo "Note: these uncommitted changes WILL be published:"; sed 's/^/  /' <<<"$changes"; }
  read -r -p 'Deploy anyway? [y/N] ' ans
  [[ "$ans" =~ ^[Yy] ]] || { echo "Cancelled."; exit 1; }
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  read -rs -p 'Cloudflare API token: ' CLOUDFLARE_API_TOKEN; echo
  [ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "No token entered."; exit 1; }
  export CLOUDFLARE_API_TOKEN
fi

# wrangler.jsonc runs build-prod.sh first. --yes: use the latest wrangler without asking.
npx --yes wrangler deploy

echo "Live check: https://joshthecoder.com/ -> $(curl -s -o /dev/null --max-time 30 -w '%{http_code}' "https://joshthecoder.com/?deploy=$(date +%s)")"
