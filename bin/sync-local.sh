#!/usr/bin/env bash
# bin/sync-local.sh — sync repo to a local WordPress plugin install for testing
#
# Usage:
#   bin/sync-local.sh [target-plugin-dir]
#
# If no argument is given, looks for BAZAAR_LOCAL_DIR in the environment or
# falls back to the path configured below.
#
# What it does:
#   1. Regenerates the Composer classmap (dump-autoload) so new PHP classes
#      are always discovered — prevents "Class not found" fatal errors.
#   2. rsyncs src/, admin/, wares/, bazaar.php and related files.
#   3. Syncs vendor/autoload.php + vendor/composer/ (the lightweight generated
#      autoloader shims) without copying the 60 MB of dev-only packages.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Resolve target directory
# ---------------------------------------------------------------------------
TARGET="${1:-${BAZAAR_LOCAL_DIR:-/Users/nick/Studio/tier-4/wp-content/plugins/bazaar}}"

if [[ ! -d "${TARGET}" ]]; then
  echo "ERROR: target directory not found: ${TARGET}" >&2
  echo "  Pass it as an argument or set BAZAAR_LOCAL_DIR in your environment." >&2
  exit 1
fi

echo "→ Syncing to ${TARGET}"

# ---------------------------------------------------------------------------
# 1. Regenerate classmap so new PHP classes are included
# ---------------------------------------------------------------------------
echo "  [1/3] Regenerating Composer classmap…"
cd "${REPO_ROOT}"
if [[ -f "${REPO_ROOT}/composer.phar" ]]; then
  COMPOSER="php ${REPO_ROOT}/composer.phar"
elif command -v composer &>/dev/null; then
  COMPOSER="composer"
else
  echo "  WARNING: composer not found — skipping dump-autoload (classmap may be stale)" >&2
  COMPOSER=""
fi

if [[ -n "${COMPOSER}" ]]; then
  ${COMPOSER} dump-autoload --optimize --no-dev --quiet
fi

# ---------------------------------------------------------------------------
# 2. Sync plugin source files (exclude large/generated paths)
# ---------------------------------------------------------------------------
echo "  [2/3] Syncing plugin files…"
rsync -a --delete \
  --exclude='/vendor/' \
  --exclude='/node_modules/' \
  --exclude='/.git/' \
  --exclude='/dist/' \
  --exclude='/tests/' \
  --exclude='/packages/' \
  --exclude='/wares/' \
  --exclude='/.github/' \
  --exclude='/bin/' \
  --exclude='*.map' \
  --exclude='composer.phar' \
  "${REPO_ROOT}/" \
  "${TARGET}/"

# ---------------------------------------------------------------------------
# 3. Sync autoloader shims + packages needed at runtime
# ---------------------------------------------------------------------------
echo "  [3/3] Syncing autoloader shims and runtime packages…"
rsync -a \
  "${REPO_ROOT}/vendor/autoload.php" \
  "${TARGET}/vendor/"

rsync -a --delete \
  "${REPO_ROOT}/vendor/composer/" \
  "${TARGET}/vendor/composer/"

# packages/updater-mcupdateface is excluded by the main rsync (packages/ is a
# dev workspace) but github-updater.php requires it at runtime.
mkdir -p "${TARGET}/packages/updater-mcupdateface/src"
rsync -a \
  "${REPO_ROOT}/packages/updater-mcupdateface/src/UpdaterMcUpdateface.php" \
  "${TARGET}/packages/updater-mcupdateface/src/"

echo "  ✓ Done."
