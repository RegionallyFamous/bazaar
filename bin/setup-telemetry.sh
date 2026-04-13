#!/usr/bin/env bash
# bin/setup-telemetry.sh — one-shot Cloudflare Workers + D1 telemetry setup
#
# Prerequisites:
#   npm install -g wrangler
#   wrangler login
#
# What it does:
#   1. Creates the D1 database (idempotent — skips if already exists)
#   2. Patches the database_id into telemetry-worker/wrangler.toml
#   3. Creates the pings table
#   4. Deploys the worker
#   5. Prints the worker URL for use in wp-config.php

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKER_DIR="${REPO_ROOT}/telemetry-worker"
DB_NAME="bazaar-telemetry"

echo "→ Creating D1 database '${DB_NAME}' (safe to re-run)…"
CREATE_OUTPUT=$(wrangler d1 create "${DB_NAME}" 2>&1 || true)

# Extract the database_id from the output (handles both fresh create and
# "already exists" error by falling back to d1 list).
DB_ID=$(echo "${CREATE_OUTPUT}" | grep -oE 'database_id = "[^"]+"' | head -1 | grep -oE '"[^"]+"' | tr -d '"' || true)

if [[ -z "${DB_ID}" ]]; then
  echo "  (database may already exist — fetching id from wrangler d1 list)"
  DB_ID=$(wrangler d1 list --json 2>/dev/null \
    | python3 -c "import sys,json; data=json.load(sys.stdin); \
      [print(d['uuid']) for d in data if d['name']=='${DB_NAME}']" 2>/dev/null \
    | head -1 || true)
fi

if [[ -z "${DB_ID}" ]]; then
  echo "ERROR: Could not determine D1 database ID." >&2
  echo "  Run 'wrangler d1 list' manually, find '${DB_NAME}', and paste its UUID" >&2
  echo "  into telemetry-worker/wrangler.toml as database_id." >&2
  exit 1
fi

echo "  database_id = ${DB_ID}"

# Patch wrangler.toml with the real database_id.
sed -i.bak "s/REPLACE_WITH_D1_DATABASE_ID/${DB_ID}/" "${WORKER_DIR}/wrangler.toml"
rm -f "${WORKER_DIR}/wrangler.toml.bak"
echo "  ✓ wrangler.toml updated"

echo "→ Creating pings table…"
wrangler d1 execute "${DB_NAME}" --remote --command \
  "CREATE TABLE IF NOT EXISTS pings (
    site_hash  TEXT PRIMARY KEY,
    plugin_ver TEXT,
    wp_ver     TEXT,
    php_ver    TEXT,
    locale     TEXT,
    multisite  INTEGER,
    first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )"
echo "  ✓ table ready"

echo "→ Deploying worker…"
cd "${WORKER_DIR}"
wrangler deploy

echo ""
echo "✓ Done. Copy the worker URL above and set it in wp-config.php:"
echo ""
echo "  define( 'BAZAAR_TELEMETRY_ENDPOINT', 'https://bazaar-telemetry.<yourname>.workers.dev' );"
echo ""
echo "Useful queries:"
echo "  wrangler d1 execute ${DB_NAME} --command \"SELECT COUNT(*) FROM pings WHERE last_seen > datetime('now','-30 days')\""
echo "  wrangler d1 execute ${DB_NAME} --command \"SELECT plugin_ver, COUNT(*) n FROM pings GROUP BY plugin_ver ORDER BY n DESC\""
