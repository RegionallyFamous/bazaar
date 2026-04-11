#!/usr/bin/env bash
# bin/build-zip.sh — build a production-ready distribution zip
#
# Usage:
#   bin/build-zip.sh              # uses version from bazaar.php
#   bin/build-zip.sh 1.2.3        # override version
#
# Output: dist/bazaar-<version>.zip
#
# What it does:
#   1. Builds JS assets (npm run build)
#   2. Installs only production PHP autoloader (composer install --no-dev)
#   3. Stages a clean copy of the plugin, excluding .distignore paths
#   4. Zips it as bazaar/<all files> so WordPress can install it directly

set -euo pipefail

PLUGIN_SLUG="bazaar"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"

# Resolve version: argument → plugin header → fallback
if [[ "${1:-}" != "" ]]; then
  VERSION="${1}"
else
  VERSION="$(grep -m1 '^ \* Version:' "${REPO_ROOT}/bazaar.php" | sed 's/.*Version: *//')"
fi

ZIP_NAME="${PLUGIN_SLUG}-${VERSION}.zip"
STAGE_DIR="$(mktemp -d)/bazaar-zip"

echo "→ Building ${ZIP_NAME}"

# 1. JS build ---------------------------------------------------------------
echo "  [1/4] Building JS assets…"
cd "${REPO_ROOT}"
npm run build --silent

# 2. Production autoloader --------------------------------------------------
echo "  [2/4] Installing production autoloader (--no-dev)…"
# Prefer a local composer.phar (used in CI); fall back to the system composer.
if [[ -f "${REPO_ROOT}/composer.phar" ]]; then
  COMPOSER="php ${REPO_ROOT}/composer.phar"
elif command -v composer &>/dev/null; then
  COMPOSER="composer"
else
  echo "  ERROR: composer not found (no composer.phar and no system composer)" >&2
  exit 1
fi
${COMPOSER} install --no-dev --no-scripts --classmap-authoritative --quiet

# Sanity check: vendor/ must now contain the autoloader and nothing else
if [[ ! -f "${REPO_ROOT}/vendor/autoload.php" ]]; then
  echo "  ERROR: vendor/autoload.php missing after composer install --no-dev" >&2
  exit 1
fi

# 3. Stage clean copy -------------------------------------------------------
echo "  [3/4] Staging files…"
mkdir -p "${STAGE_DIR}/${PLUGIN_SLUG}"

rsync -a --no-links \
  --exclude-from="${REPO_ROOT}/.distignore" \
  "${REPO_ROOT}/" \
  "${STAGE_DIR}/${PLUGIN_SLUG}/"

# 4. Zip --------------------------------------------------------------------
echo "  [4/4] Zipping…"
mkdir -p "${DIST_DIR}"
cd "${STAGE_DIR}"
zip -r "${DIST_DIR}/${ZIP_NAME}" "${PLUGIN_SLUG}/" --quiet

# Restore full dev vendor after building so local tooling still works
cd "${REPO_ROOT}"
${COMPOSER} install --no-scripts --quiet

SIZE="$(du -sh "${DIST_DIR}/${ZIP_NAME}" | cut -f1)"
echo "  ✓ ${DIST_DIR}/${ZIP_NAME} (${SIZE})"
