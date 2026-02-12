#!/bin/bash
# Factory Control - Release Automation Script

set -e # Exit on error

echo "🚀 Factory Control Release Workflow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Ensure clean git status
if [[ -n $(git status -s) ]]; then
  echo "❌ Error: Working directory not clean. "
  echo "   Please commit or stash your changes before releasing."
  git status
  exit 1
fi

# 2. Get current version
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' package.json | cut -d'"' -f4)
echo "Current Version: $CURRENT_VERSION"

# 3. Prompt for new version
read -p "Enter new version (e.g., 1.1.0): " NEW_VERSION

if [[ -z "$NEW_VERSION" ]]; then
  echo "❌ Version cannot be empty."
  exit 1
fi

# 4. Run Tests (Manual Verification)
echo ""
echo "🧪 Opening tests in browser..."
echo "   Please verify ALL tests pass before continuing."
npm run test
npm run test:compat
echo ""
read -p "Did all tests pass? (y/N) " TEST_CONFIRM
if [[ "$TEST_CONFIRM" != "y" ]]; then
  echo "❌ Release aborted. Fix tests first."
  exit 1
fi

# 5. Update version in package.json (Mac compatible sed)
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "✅ Updated package.json to v$NEW_VERSION"

# 6. Commit Version Bump
git add package.json
git commit -m "chore(release): bump version to v$NEW_VERSION"

# 7. Create Git Tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
echo "✅ Created git tag v$NEW_VERSION"

# 8. Push to GitHub
echo "⬆️  Pushing to GitHub..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "🎉 Release v$NEW_VERSION deployed successfully!"
echo "   GitHub: https://github.com/guymaich-jpg/factory-control/releases/tag/v$NEW_VERSION"
echo "   Live App: https://guymaich-jpg.github.io/factory-control/"
