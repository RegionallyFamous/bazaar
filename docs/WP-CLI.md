# WP-CLI Reference

Bazaar ships with a full WP-CLI command suite. Everything you can do in the admin UI, you can do from the terminal — and automate.

```bash
wp bazaar <command>
```

---

## Commands

### `wp bazaar list`

List all installed wares.

```bash
wp bazaar list [--status=<status>] [--format=<format>] [--fields=<fields>]
```

**Options**

| Option | Default | Description |
|---|---|---|
| `--status` | `all` | Filter by `enabled`, `disabled`, or `all` |
| `--format` | `table` | Output as `table`, `json`, `csv`, `yaml`, or `count` |
| `--fields` | `slug,name,version,author,status` | Comma-separated field list |

**Examples**

```bash
# Show all wares in a table
wp bazaar list

# Show only enabled wares as JSON (great for scripting)
wp bazaar list --status=enabled --format=json

# Count disabled wares
wp bazaar list --status=disabled --format=count

# Get just slugs and versions as CSV
wp bazaar list --fields=slug,version --format=csv
```

---

### `wp bazaar install`

Install a ware from a `.wp` file.

```bash
wp bazaar install <file> [--force]
```

**Arguments**

| Argument | Description |
|---|---|
| `<file>` | Path to the `.wp` file |

**Options**

| Option | Description |
|---|---|
| `--force` | Re-install even if a ware with the same slug already exists (deletes the old one first) |

**Examples**

```bash
# Install a ware
wp bazaar install invoice-generator.wp

# Upgrade an existing ware to a new version
wp bazaar install invoice-generator-v2.wp --force

# Install from an absolute path
wp bazaar install ~/Downloads/project-tracker.wp
```

---

### `wp bazaar enable`

Enable a disabled ware so its menu page appears.

```bash
wp bazaar enable <slug>
```

**Examples**

```bash
wp bazaar enable invoice-generator
```

---

### `wp bazaar disable`

Disable a ware — its menu page disappears without deleting its files.

```bash
wp bazaar disable <slug>
```

**Examples**

```bash
wp bazaar disable invoice-generator
```

---

### `wp bazaar delete`

Delete a ware and permanently remove all its files from disk.

```bash
wp bazaar delete <slug> [--yes]
```

**Options**

| Option | Description |
|---|---|
| `--yes` | Skip the confirmation prompt |

**Examples**

```bash
# With confirmation prompt
wp bazaar delete invoice-generator

# Skip the prompt (for scripts)
wp bazaar delete invoice-generator --yes
```

---

### `wp bazaar info`

Show all stored metadata for a single ware.

```bash
wp bazaar info <slug> [--format=<format>]
```

**Examples**

```bash
wp bazaar info invoice-generator
wp bazaar info invoice-generator --format=json
```

**Example output:**

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

## Scripting Patterns

### Bulk install from a directory

```bash
for ware in ~/wares/*.wp; do
  wp bazaar install "$ware"
done
```

### Export registry as JSON

```bash
wp bazaar list --format=json > wares-backup.json
```

### Disable all wares at once

```bash
wp bazaar list --status=enabled --fields=slug --format=csv | tail -n +2 | while read slug; do
  wp bazaar disable "$slug"
done
```

### CI/CD deployment script

```bash
#!/usr/bin/env bash
set -euo pipefail

# Deploy a ware to production via SSH
REMOTE="user@your-server.com"
WP_PATH="/var/www/html"

echo "Building ware..."
npm run package

echo "Uploading to server..."
scp my-ware.wp "${REMOTE}:/tmp/my-ware.wp"

echo "Installing on production..."
ssh "$REMOTE" "wp --path='${WP_PATH}' bazaar install /tmp/my-ware.wp --force && rm /tmp/my-ware.wp"

echo "Done."
```

### Check if a ware is installed before running a script

```bash
if wp bazaar list --format=json | grep -q '"slug":"invoice-generator"'; then
  echo "invoice-generator is installed"
else
  echo "not installed"
fi
```

---

## Using WP-CLI Aliases for Multi-Site

If you manage wares across multiple WordPress installs, define aliases in `~/.wp-cli/config.yml`:

```yaml
@production:
  ssh: user@production.example.com
  path: /var/www/html

@staging:
  ssh: user@staging.example.com
  path: /var/www/staging
```

Then run Bazaar commands on any site:

```bash
wp @production bazaar list
wp @staging bazaar install invoice-generator.wp --force
```

See [WordPress Shell](WordPress-Shell.md) for more WP-CLI power patterns.
