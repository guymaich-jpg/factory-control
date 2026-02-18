#!/bin/bash
# ============================================================
# Release STAGING → MAIN (Production)
# Usage: npm run release:prod
# ============================================================
set -e

CURRENT=$(git branch --show-current)

echo "▶ Releasing staging → main (production)..."

if [[ -n $(git status --porcelain) ]]; then
  echo "✖ Uncommitted changes. Please commit or stash first."
  exit 1
fi

# Safety check: must be on staging
if [[ "$CURRENT" != "staging" ]]; then
  echo "✖ Must be on staging branch to release to production. Currently on: $CURRENT"
  exit 1
fi

# Run e2e tests before promoting
echo "▶ Running e2e tests..."
if command -v npx &>/dev/null && [ -f playwright.config.js ]; then
  npx playwright test --reporter=line || { echo "✖ Tests failed. Aborting release."; exit 1; }
else
  echo "⚠ Playwright not installed, skipping e2e tests."
fi

# Bump version
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
echo "▶ Releasing version $VERSION to production..."

git checkout main
git merge --no-ff staging -m "chore(release): v$VERSION to production [$(date +%Y-%m-%d)]"
git tag -a "v$VERSION" -m "Release v$VERSION"

echo "✔ Production updated. Push with: git push origin main --tags"
git checkout staging
