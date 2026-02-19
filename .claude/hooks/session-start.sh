#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code on the web environment
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install npm dependencies (e.g. @playwright/test)
npm install

# Install Playwright browser binaries needed for E2E tests
npx playwright install chromium --with-deps
