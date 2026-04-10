# WP-CLI Reference

Bazaar ships with a full WP-CLI command suite. Everything you can do in the admin UI, you can do from the terminal — and automate.

```bash
wp bazaar <command> [options]
```

---

## Table of Contents

- [Lifecycle](#lifecycle)
  - [list-wares](#wp-bazaar-list-wares)
  - [install](#wp-bazaar-install)
  - [enable](#wp-bazaar-enable)
  - [disable](#wp-bazaar-disable)
  - [delete](#wp-bazaar-delete)
  - [info](#wp-bazaar-info)
- [Registry & Updates](#registry--updates)
  - [search](#wp-bazaar-search)
  - [outdated](#wp-bazaar-outdated)
  - [update](#wp-bazaar-update)
- [Operations](#operations)
  - [dev](#wp-bazaar-dev)
  - [license](#wp-bazaar-license)
  - [analytics](#wp-bazaar-analytics)
  - [doctor](#wp-bazaar-doctor)
  - [logs](#wp-bazaar-logs)
  - [audit](#wp-bazaar-audit)
  - [csp](#wp-bazaar-csp)
  - [bundle](#wp-bazaar-bundle)
- [Developer Tools](#developer-tools)
  - [scaffold](#wp-bazaar-scaffold)
  - [types](#wp-bazaar-types)
  - [sign](#wp-bazaar-sign)
  - [keypair](#wp-bazaar-keypair)
- [Scripting Patterns](#scripting-patterns)
- [Multi-Site with Aliases](#multi-site-with-aliases)

---

## Lifecycle

### `wp bazaar list-wares`

List all installed wares.

```bash
wp bazaar list-wares [--status=<status>] [--format=<format>] [--fields=<fields>]
```

| Option | Default | Accepts |
|:---|:---:|:---|
| `--status` | `all` | `all` · `enabled` · `disabled` |
| `--format` | `table` | `table` · `json` · `csv` · `yaml` · `count` |
| `--fields` | `slug,name,version,author,status` | Any comma-separated field names |

```bash
# Show all wares
wp bazaar list-wares

# Enabled wares as JSON — great for scripting
wp bazaar list-wares --status=enabled --format=json

# Count disabled wares
wp bazaar list-wares --status=disabled --format=count

# Slugs and versions only, as CSV
wp bazaar list-wares --fields=slug,version --format=csv
```

---

### `wp bazaar install`

Install a ware from a `.wp` file.

```bash
wp bazaar install <file> [--force]
```

| Argument / Option | Description |
|:---|:---|
| `<file>` | Path to the `.wp` file (relative or absolute) |
| `--force` | Re-install even if the slug exists — deletes the old version first |

```bash
wp bazaar install invoice-generator.wp
wp bazaar install invoice-generator-v2.wp --force
wp bazaar install ~/Downloads/project-tracker.wp
```

> [!TIP]
> `--force` is your local upgrade path. For remote registry updates use `wp bazaar update`.

---

### `wp bazaar enable`

Enable a disabled ware so its menu page reappears.

```bash
wp bazaar enable <slug>
```

---

### `wp bazaar disable`

Disable a ware — its menu page disappears without deleting files.

```bash
wp bazaar disable <slug>
```

---

### `wp bazaar delete`

Delete a ware and permanently remove all its files.

```bash
wp bazaar delete <slug> [--yes]
```

`--yes` skips the confirmation prompt (required in non-interactive scripts).

> [!WARNING]
> Irreversible. Files in `wp-content/bazaar/{slug}/` are deleted immediately.

---

### `wp bazaar info`

Show all stored metadata for a single ware.

```bash
wp bazaar info <slug> [--format=<format>]
```

```
+-------------+----------------------------------+
| Field       | Value                            |
+-------------+----------------------------------+
| slug        | invoice-generator                |
| name        | Invoice Generator                |
| version     | 1.0.0                            |
| author      | Nick                             |
| description | Generate invoices from wp-admin. |
| status      | enabled                          |
| entry       | index.html                       |
| menu_title  | Invoices                         |
| capability  | manage_options                   |
| installed   | 2026-04-10T12:00:00Z             |
+-------------+----------------------------------+
```

---

## Registry & Updates

### `wp bazaar search`

Search the remote Bazaar registry for available wares.

```bash
wp bazaar search <query> [--format=<format>]
```

```bash
wp bazaar search crm
wp bazaar search invoice --format=json
```

---

### `wp bazaar outdated`

List installed wares that have a newer version available in the registry. Pass a slug to check just one ware.

```bash
wp bazaar outdated [<slug>] [--refresh] [--format=<format>]
```

| Option | Description |
|:---|:---|
| `--refresh` | Force a live registry check instead of using the cached result |

```bash
wp bazaar outdated
wp bazaar outdated invoice-generator --refresh
```

---

### `wp bazaar update`

Download and install the latest version of a ware from the registry.

```bash
wp bazaar update <slug>
wp bazaar update --all
```

`--all` updates every ware that has an available upgrade.

---

## Operations

### `wp bazaar dev`

Manage dev mode for a ware. In dev mode Bazaar proxies the ware's iframe to a local Vite (or any) dev server, giving you instant hot-reload without packaging.

```bash
wp bazaar dev start <slug> [<url>] [--verbose]
wp bazaar dev stop  <slug>
```

| Argument | Description |
|:---|:---|
| `<slug>` | Ware slug |
| `<url>` | Dev server URL (default: `http://localhost:5173`) |
| `--verbose` | Log HMR connection events |

```bash
# Start dev mode pointing at Vite's default port
wp bazaar dev start invoice-generator

# Use a custom port
wp bazaar dev start invoice-generator http://localhost:4000

# Stop dev mode (ware reverts to the installed build)
wp bazaar dev stop invoice-generator
```

---

### `wp bazaar license`

Manage license keys for paid wares.

```bash
wp bazaar license set    <slug> <key>
wp bazaar license check  <slug> [--porcelain]
wp bazaar license remove <slug>
```

| Sub-command | Description |
|:---|:---|
| `set <slug> <key>` | Store a key and run remote validation if a `license.url` is configured |
| `check <slug>` | Show validation status. `--porcelain` returns just `valid` or `invalid` for scripting. |
| `remove <slug>` | Delete the stored key |

```bash
wp bazaar license set   invoice-generator XXXX-YYYY-ZZZZ
wp bazaar license check invoice-generator
wp bazaar license check invoice-generator --porcelain
wp bazaar license remove invoice-generator
```

---

### `wp bazaar analytics`

View page-view and engagement stats for a ware.

```bash
wp bazaar analytics [<slug>] [--days=<days>] [--format=<format>]
```

Omit `<slug>` for aggregate stats across all wares.

```bash
wp bazaar analytics invoice-generator --days=7
wp bazaar analytics --days=30 --format=json
```

---

### `wp bazaar doctor`

Run health checks for one ware or all wares. Reports on manifest validity, file integrity, license status, and external dependency reachability.

```bash
wp bazaar doctor [--slug=<slug>] [--format=<format>]
```

```bash
wp bazaar doctor
wp bazaar doctor --slug=invoice-generator
wp bazaar doctor --format=json
```

---

### `wp bazaar logs`

Display the client-side error log reported by wares.

```bash
wp bazaar logs [<slug>] [--count=<count>] [--format=<format>]
```

```bash
wp bazaar logs
wp bazaar logs invoice-generator
wp bazaar logs invoice-generator --count=100 --format=json
```

---

### `wp bazaar audit`

Display the audit trail of ware lifecycle events.

```bash
wp bazaar audit [<slug>] [--event=<event>] [--count=<count>] [--format=<format>]
```

```bash
wp bazaar audit
wp bazaar audit invoice-generator
wp bazaar audit --event=install --format=json
```

---

### `wp bazaar csp`

View and manage the Content Security Policy for a ware.

```bash
wp bazaar csp <slug> [--set=<directive=value>] [--reset] [--format=<format>]
```

| Option | Description |
|:---|:---|
| (none) | Display the current CSP directives |
| `--set="connect-src 'self' https://api.stripe.com"` | Update a single directive |
| `--reset` | Reset to the Bazaar baseline |

```bash
# View current CSP
wp bazaar csp invoice-generator

# Add Stripe to connect-src
wp bazaar csp invoice-generator --set="connect-src 'self' https://api.stripe.com"

# Reset to defaults
wp bazaar csp invoice-generator --reset
```

---

### `wp bazaar bundle`

Install a `.wpbundle` archive — a multi-ware package that installs several wares in one step.

```bash
wp bazaar bundle <file.wpbundle> [--verbose]
```

```bash
wp bazaar bundle finance-suite.wpbundle
wp bazaar bundle ~/Downloads/starter-pack.wpbundle --verbose
```

---

## Developer Tools

### `wp bazaar scaffold`

Generate a REST endpoint stub with a matching TypeScript type helper.

```bash
wp bazaar scaffold endpoint <name> [--namespace=<namespace>] [--route=<route>]
```

```bash
wp bazaar scaffold endpoint sync_orders
wp bazaar scaffold endpoint list_products --namespace=my-ware/v1
```

Output: a PHP file with `register_rest_route()` wired up, ready to drop into a companion plugin.

---

### `wp bazaar types`

Emit TypeScript type definitions derived from a ware's manifest (menu, permissions, config schema).

```bash
wp bazaar types <slug> [--out=<file>]
```

```bash
wp bazaar types invoice-generator
wp bazaar types invoice-generator --out=src/types/bazaar.d.ts
```

---

### `wp bazaar sign`

Sign a `.wp` archive with an RSA private key. The resulting signature is embedded in the archive's `manifest.json` under `registry.signature` and verified on install.

```bash
wp bazaar sign <file.wp> --key=<privkey.pem> [--passphrase=<pass>]
```

```bash
wp bazaar sign invoice-generator.wp --key=private.pem
wp bazaar sign invoice-generator.wp --key=private.pem --passphrase=hunter2
```

---

### `wp bazaar keypair`

Generate an RSA-4096 keypair for ware signing.

```bash
wp bazaar keypair [<output-dir>]
```

Writes `bazaar-private.pem` and `bazaar-public.pem` to the given directory (default: current directory).

```bash
wp bazaar keypair
wp bazaar keypair ~/.bazaar/keys/
```

---

## Scripting Patterns

### Bulk install from a directory

```bash
for ware in ~/wares/*.wp; do
  wp bazaar install "$ware"
done
```

### Export the full registry as JSON

```bash
wp bazaar list-wares --format=json > wares-backup.json
```

### Disable all wares at once

```bash
wp bazaar list-wares --status=enabled --fields=slug --format=csv \
  | tail -n +2 \
  | while read slug; do
      wp bazaar disable "$slug"
    done
```

### Check for updates in CI

```bash
#!/usr/bin/env bash
set -euo pipefail

outdated=$(wp bazaar outdated --format=json)
count=$(echo "$outdated" | jq length)

if [ "$count" -gt 0 ]; then
  echo "$count ware(s) have updates available:"
  echo "$outdated" | jq '.[] | "\(.slug): \(.current) → \(.latest)"' -r
  exit 1
fi
echo "All wares are up to date."
```

### CI/CD deployment

```bash
#!/usr/bin/env bash
set -euo pipefail

REMOTE="deploy@your-server.com"
WP_PATH="/var/www/html"

npm run package

scp my-ware.wp "${REMOTE}:/tmp/my-ware.wp"
ssh "$REMOTE" "wp --path='${WP_PATH}' bazaar install /tmp/my-ware.wp --force && rm /tmp/my-ware.wp"
```

### Check if a ware is installed before acting

```bash
if wp bazaar list-wares --format=json | jq -e '.[] | select(.slug == "invoice-generator")' > /dev/null; then
  echo "invoice-generator is installed"
else
  wp bazaar install invoice-generator.wp
fi
```

---

## Multi-Site with Aliases

Define site aliases in `~/.wp-cli/config.yml` to run Bazaar commands on any environment:

```yaml
@production:
  ssh: deploy@production.example.com
  path: /var/www/html

@staging:
  ssh: deploy@staging.example.com
  path: /var/www/staging

@local:
  path: ~/Sites/mysite
```

```bash
wp @production bazaar list-wares
wp @staging    bazaar install invoice-generator.wp --force
wp @local      bazaar delete  old-ware --yes
```

> [!TIP]
> See [WordPress Shell](WordPress-Shell.md) for advanced automation patterns including environment sync scripts and GitHub Actions CI integration.
