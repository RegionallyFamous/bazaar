# WP-CLI Reference

Bazaar ships with a full WP-CLI command suite. Everything you can do in the admin UI, you can do from the terminal — and automate.

```bash
wp bazaar <command> [options]
```

---

## Table of Contents

- [Commands](#commands)
  - [list](#wp-bazaar-list)
  - [install](#wp-bazaar-install)
  - [enable](#wp-bazaar-enable)
  - [disable](#wp-bazaar-disable)
  - [delete](#wp-bazaar-delete)
  - [info](#wp-bazaar-info)
- [Scripting Patterns](#scripting-patterns)
- [Multi-Site with Aliases](#multi-site-with-aliases)

---

## Commands

### `wp bazaar list`

List all installed wares.

```bash
wp bazaar list [--status=<status>] [--format=<format>] [--fields=<fields>]
```

| Option | Default | Accepts |
|:---|:---:|:---|
| `--status` | `all` | `all` · `enabled` · `disabled` |
| `--format` | `table` | `table` · `json` · `csv` · `yaml` · `count` |
| `--fields` | `slug,name,version,author,status` | Any comma-separated field names |

```bash
# Show all wares in a table
wp bazaar list

# Enabled wares only, as JSON — great for scripting
wp bazaar list --status=enabled --format=json

# Count disabled wares
wp bazaar list --status=disabled --format=count

# Slugs and versions only, as CSV
wp bazaar list --fields=slug,version --format=csv
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
| `--force` | Re-install even if a ware with the same slug exists — deletes the old one first |

```bash
# Fresh install
wp bazaar install invoice-generator.wp

# Upgrade an existing ware to a new version
wp bazaar install invoice-generator-v2.wp --force

# Install from an absolute path
wp bazaar install ~/Downloads/project-tracker.wp
```

> [!TIP]
> `--force` is your upgrade path. Bump the version in `manifest.json`, re-package, and `install --force`.

---

### `wp bazaar enable`

Enable a disabled ware so its menu page reappears.

```bash
wp bazaar enable <slug>
```

```bash
wp bazaar enable invoice-generator
# Success: Enabled "invoice-generator".
```

---

### `wp bazaar disable`

Disable a ware — its menu page disappears without deleting files.

```bash
wp bazaar disable <slug>
```

```bash
wp bazaar disable invoice-generator
# Success: Disabled "invoice-generator".
```

---

### `wp bazaar delete`

Delete a ware and permanently remove all its files from disk.

```bash
wp bazaar delete <slug> [--yes]
```

| Option | Description |
|:---|:---|
| `--yes` | Skip the confirmation prompt (required in non-interactive scripts) |

```bash
# Interactive — prompts for confirmation
wp bazaar delete invoice-generator

# Non-interactive — use in scripts
wp bazaar delete invoice-generator --yes
```

> [!WARNING]
> This is irreversible. Files in `wp-content/bazaar/{slug}/` are deleted immediately.

---

### `wp bazaar info`

Show all stored metadata for a single ware.

```bash
wp bazaar info <slug> [--format=<format>]
```

```bash
wp bazaar info invoice-generator
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

```bash
# Machine-readable
wp bazaar info invoice-generator --format=json
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
wp bazaar list --format=json > wares-backup.json
```

### Disable all wares at once

```bash
wp bazaar list --status=enabled --fields=slug --format=csv \
  | tail -n +2 \
  | while read slug; do
      wp bazaar disable "$slug"
    done
```

### CI/CD deployment script

```bash
#!/usr/bin/env bash
set -euo pipefail

REMOTE="deploy@your-server.com"
WP_PATH="/var/www/html"

echo "Building ware..."
npm run package

echo "Uploading to server..."
scp my-ware.wp "${REMOTE}:/tmp/my-ware.wp"

echo "Installing on production..."
ssh "$REMOTE" "wp --path='${WP_PATH}' bazaar install /tmp/my-ware.wp --force && rm /tmp/my-ware.wp"

echo "Done."
```

### Check if a ware is installed before acting

```bash
if wp bazaar list --format=json | grep -q '"slug":"invoice-generator"'; then
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
wp @production bazaar list
wp @staging    bazaar install invoice-generator.wp --force
wp @local      bazaar delete  old-ware --yes
```

> [!TIP]
> See [WordPress Shell](WordPress-Shell.md) for advanced automation patterns including environment sync scripts and GitHub Actions CI integration.
