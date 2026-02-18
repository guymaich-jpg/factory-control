#!/bin/bash
# ============================================================
# Release DEV → STAGING
# Usage: npm run release:staging
# ============================================================
set -e

CURRENT=$(git branch --show-current)
echo "▶ Releasing from $CURRENT to staging..."

# Ensure working tree is clean
if [[ -n $(git status --porcelain) ]]; then
  echo "✖ Uncommitted changes. Please commit or stash first."
  exit 1
fi

# Merge dev into staging
git checkout staging
git merge --no-ff "$CURRENT" -m "chore(staging): merge $CURRENT into staging [$(date +%Y-%m-%d)]"

echo "✔ Staging updated. Push with: git push origin staging"
git checkout "$CURRENT"
