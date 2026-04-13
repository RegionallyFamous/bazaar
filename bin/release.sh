#!/usr/bin/env bash
# bin/release.sh — tag and release Bazaar
#
# Usage: bash bin/release.sh
#
# What it does:
#   1. Reads the version from the bazaar.php plugin header (single source of truth)
#   2. Verifies package.json and readme.txt Stable tag are in sync
#   3. Verifies the working tree is clean and main is up-to-date with origin
#   4. Verifies no tag for this version already exists
#   5. Creates and pushes the git tag — CI then builds the plugin zip, builds
#      all .wp ware files, creates the GitHub release, and attaches all assets
#
# DO NOT run `gh release create` manually to initiate a release.
# The CI workflow handles release creation and all asset uploads.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# 1. Read version from bazaar.php (plugin header is the single source of truth)
# ---------------------------------------------------------------------------
PLUGIN_FILE="$REPO_ROOT/bazaar.php"
VERSION="$(grep -m1 '^ \* Version:' "$PLUGIN_FILE" | sed 's/.*Version:[[:space:]]*//' | tr -d '[:space:]')"

if [[ -z "$VERSION" ]]; then
  echo "error: could not read Version from $PLUGIN_FILE" >&2
  exit 1
fi

TAG="v$VERSION"
echo "Release version: $VERSION  (tag: $TAG)"

# ---------------------------------------------------------------------------
# 2. Verify package.json is in sync
# ---------------------------------------------------------------------------
PKG_VERSION="$(grep -m1 '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version":[[:space:]]*"//' | tr -d '"[:space:],')"

if [[ "$PKG_VERSION" != "$VERSION" ]]; then
  echo "error: package.json version ($PKG_VERSION) does not match bazaar.php ($VERSION)" >&2
  echo "       Run: npm version $VERSION --no-git-tag-version" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Verify readme.txt Stable tag is in sync
# ---------------------------------------------------------------------------
README_TAG="$(grep -m1 '^Stable tag:' "$REPO_ROOT/readme.txt" | sed 's/Stable tag:[[:space:]]*//' | tr -d '[:space:]')"

if [[ "$README_TAG" != "$VERSION" ]]; then
  echo "error: readme.txt Stable tag ($README_TAG) does not match bazaar.php ($VERSION)" >&2
  echo "       Update 'Stable tag:' in readme.txt before releasing." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Verify working tree is clean
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree has uncommitted changes — commit or stash them first" >&2
  git status --short >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Verify main is up-to-date with origin
# ---------------------------------------------------------------------------
BRANCH="$(git symbolic-ref --short HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "error: not on main branch (currently on '$BRANCH')" >&2
  exit 1
fi

git fetch --quiet origin main
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"

if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
  echo "error: local main is not in sync with origin/main" >&2
  echo "       local:  $LOCAL_SHA" >&2
  echo "       remote: $REMOTE_SHA" >&2
  echo "       Pull or push as needed before releasing." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 6. Verify tag does not already exist
# ---------------------------------------------------------------------------
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG already exists locally — delete it first if you intend to re-release" >&2
  exit 1
fi

if git ls-remote --tags origin "$TAG" | grep -q "$TAG"; then
  echo "error: tag $TAG already exists on origin" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 7. Tag and push — CI takes it from here
# ---------------------------------------------------------------------------
echo ""
echo "All checks passed."
echo ""
echo "Creating and pushing tag $TAG ..."
git tag "$TAG"
git push origin "$TAG"

echo ""
echo "Done. CI is now running:"
echo "  • php / js / build-wares jobs (in parallel)"
echo "  • release-zip attaches bazaar-$VERSION.zip and bazaar.zip to the release"
echo "  • release-wares attaches all .wp ware files and icons to the release"
echo ""
echo "Monitor progress at:"
echo "  https://github.com/RegionallyFamous/bazaar/actions"
echo ""
echo "The GitHub release will be created automatically by CI."
echo "Do NOT run 'gh release create' — CI handles it."
