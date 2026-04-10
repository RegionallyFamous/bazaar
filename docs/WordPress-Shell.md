# WordPress Shell — WP-CLI Power Guide

WP-CLI is the command-line interface for WordPress. For Bazaar developers it's indispensable: install wares, inspect the registry, test REST endpoints, seed data, and automate entire deployment pipelines without touching the browser.

---

## Table of Contents

- [Setup](#setup)
- [The Interactive Shell](#the-interactive-shell)
- [Inspecting Bazaar from the Shell](#inspecting-bazaar-from-the-shell)
- [wp eval and wp eval-file](#wp-eval-and-wp-eval-file)
- [Multi-Site & Remote Management](#multi-site--remote-management)
- [Automation Recipes](#automation-recipes)
- [Useful Commands for Ware Developers](#useful-commands-for-ware-developers)
- [Must-Have WP-CLI Packages](#must-have-wp-cli-packages)
- [Shell Aliases Worth Adding](#shell-aliases-worth-adding)

---

## Setup

### Install WP-CLI

```bash
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar
sudo mv wp-cli.phar /usr/local/bin/wp
wp --info
```

### Enable tab completion

```bash
# Add to ~/.zshrc or ~/.bashrc
source "$(wp cli completions --shell=zsh)"    # zsh
source "$(wp cli completions --shell=bash)"   # bash
```

### Set a default WordPress path

```yaml
# ~/.wp-cli/config.yml
path: /var/www/html
```

With this set, you can run `wp bazaar list` from any directory instead of always `cd`-ing to the WP root.

---

## The Interactive Shell

`wp shell` drops you into an interactive PHP REPL with the full WordPress environment loaded — every function, class, and global available instantly. Think `php -a` but with WordPress already bootstrapped.

```bash
wp shell
```

```php
wp> get_option( 'blogname' );
= "My WordPress Site"

wp> get_option( 'bazaar_registry' );
= "{\"invoice-generator\":{\"name\":\"Invoice Generator\",...}}"

wp> update_option( 'bazaar_max_ware_size', 100 * 1024 * 1024 );
= true
```

### Upgrade to PsySH

> [!TIP]
> The default `wp shell` is minimal. PsySH gives you **tab completion**, **syntax highlighting**, **command history**, `ls` to browse objects, and `doc` to read PHPDocs without leaving the terminal.

```bash
wp package install schlessera/wp-cli-psysh
wp shell   # now uses PsySH automatically
```

Inside PsySH:

```php
# Tab-complete any WordPress function
wp> get_op<TAB>    # → get_option

# Browse an object's methods and properties
wp> ls $post

# Read PHPDoc inline
wp> doc update_option

# Pretty-print any value
wp> var_dump( json_decode( get_option( 'bazaar_registry' ), true ) );
```

---

## Inspecting Bazaar from the Shell

### Pretty-print the full registry

```bash
wp eval 'echo json_encode(json_decode(get_option("bazaar_registry"), true), JSON_PRETTY_PRINT);'
```

### Inspect a single ware

```bash
wp eval '
$registry = json_decode(get_option("bazaar_registry"), true);
print_r($registry["invoice-generator"] ?? "not found");
'
```

### List ware files on disk

```bash
find "$(wp eval 'echo WP_CONTENT_DIR;')/bazaar/invoice-generator/" -type f
```

### Test the file server with authentication

```bash
NONCE=$(wp eval 'echo wp_create_nonce("wp_rest");')
SITE=$(wp option get siteurl)

# Hit the REST file server
curl -s -H "X-WP-Nonce: $NONCE" \
  "${SITE}/wp-json/bazaar/v1/serve/invoice-generator/index.html" | head -20

# Upload a ware via REST
curl -s -X POST \
  -H "X-WP-Nonce: $NONCE" \
  -F "file=@invoice-generator.wp" \
  "${SITE}/wp-json/bazaar/v1/wares" | jq .
```

### Nuclear reset — clear the registry

```bash
wp eval 'delete_option("bazaar_registry");'
# Re-install your wares after this
```

> [!CAUTION]
> The nuclear reset removes all ware *metadata* from the database but leaves the files in `wp-content/bazaar/` untouched.

---

## `wp eval` and `wp eval-file`

These are the most powerful WP-CLI commands for Bazaar developers.

### `wp eval` — one-liners

Execute a PHP snippet in the fully-bootstrapped WordPress environment:

```bash
# Check registry size
wp eval 'echo strlen(get_option("bazaar_registry")) . " bytes\n";'

# Print all wares with status
wp eval '
foreach (json_decode(get_option("bazaar_registry"), true) as $slug => $ware) {
    echo ($ware["enabled"] ? "✓" : "✗") . " {$slug} v{$ware["version"]}\n";
}
'

# Programmatically enable a ware
wp eval '
$r = json_decode(get_option("bazaar_registry"), true);
$r["invoice-generator"]["enabled"] = true;
update_option("bazaar_registry", json_encode($r), false);
echo "Done\n";
'
```

### `wp eval-file` — complex scripts

For anything longer than a few lines, put it in a `.php` file:

```bash
wp eval-file migrate-ware-data.php
```

`migrate-ware-data.php`:

```php
<?php
// Full WordPress environment is loaded — use any WP function.
$registry = json_decode( get_option( 'bazaar_registry' ), true ) ?? [];

foreach ( $registry as $slug => $ware ) {
    if ( empty( $ware['menu']['capability'] ) ) {
        $registry[ $slug ]['menu']['capability'] = 'manage_options';
        WP_CLI::log( "Fixed capability for: {$slug}" );
    }
}

update_option( 'bazaar_registry', json_encode( $registry ), false );
WP_CLI::success( 'Migration complete.' );
```

---

## Multi-Site & Remote Management

### Define environment aliases

```yaml
# ~/.wp-cli/config.yml
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
wp @local      bazaar info invoice-generator
```

### Sync enabled wares from production to staging

```bash
#!/usr/bin/env bash
set -euo pipefail

SLUGS=$(wp @production bazaar list --status=enabled --fields=slug --format=csv | tail -n +2)

for slug in $SLUGS; do
  SRC=$(wp @production eval "echo WP_CONTENT_DIR . '/bazaar/${slug}';")
  ssh deploy@production.example.com "cd '${SRC}' && zip -r /tmp/${slug}.wp ."
  scp deploy@production.example.com:/tmp/${slug}.wp /tmp/${slug}.wp
  wp @staging bazaar install /tmp/${slug}.wp --force
  rm /tmp/${slug}.wp
done

echo "Sync complete."
```

---

## Automation Recipes

### Daily health check cron

```bash
#!/usr/bin/env bash
# Add to crontab: 0 9 * * * /path/to/bazaar-health.sh

ENABLED=$(wp bazaar list --status=enabled  --format=count)
DISABLED=$(wp bazaar list --status=disabled --format=count)

echo "=== Bazaar Health Check ==="
echo "Enabled:  ${ENABLED}"
echo "Disabled: ${DISABLED}"
wp bazaar list --format=table
```

### Validate before deploying to production

```bash
#!/usr/bin/env bash
set -euo pipefail

FILE="$1"

echo "Installing on staging..."
wp @staging bazaar install "$FILE" --force

SLUG=$(unzip -p "$FILE" manifest.json | python3 -c "import sys,json; print(json.load(sys.stdin)['slug'])")
STATUS=$(wp @staging bazaar list --fields=slug,status --format=json \
  | python3 -c "import sys,json; wares=json.load(sys.stdin); print(next(w['status'] for w in wares if w['slug']=='${SLUG}'))")

if [ "$STATUS" != "enabled" ]; then
  echo "Smoke test FAILED. Ware status: $STATUS"
  exit 1
fi

echo "Staging OK — deploying to production..."
wp @production bazaar install "$FILE" --force
echo "Done."
```

### GitHub Actions CI deployment

```yaml
- name: Deploy ware to production
  run: |
    npm run package
    scp my-ware.wp ${{ secrets.PROD_HOST }}:/tmp/my-ware.wp
    ssh ${{ secrets.PROD_HOST }} \
      "wp --path=/var/www/html bazaar install /tmp/my-ware.wp --force \
       && rm /tmp/my-ware.wp"
```

---

## Useful Commands for Ware Developers

<details>
<summary><strong>Database</strong></summary>

```bash
# Snapshot before anything risky
wp db export pre-migration.sql

# Query the registry directly
wp db query "SELECT option_value FROM wp_options WHERE option_name = 'bazaar_registry'\G"

# Search-replace URLs (handles serialized data safely)
wp search-replace 'http://old.example.com' 'https://new.example.com' --dry-run
wp search-replace 'http://old.example.com' 'https://new.example.com'
```

</details>

<details>
<summary><strong>REST API inspection</strong></summary>

```bash
# List all registered REST routes
wp rest route list --format=table

# Confirm Bazaar routes are registered
wp rest route list --format=json | grep bazaar

# Make an authenticated internal request
wp eval '
$request  = new WP_REST_Request("GET", "/bazaar/v1/serve/invoice-generator/index.html");
$response = rest_do_request($request);
echo $response->get_status() . "\n";
'
```

</details>

<details>
<summary><strong>Options</strong></summary>

```bash
wp option get bazaar_registry
wp option get bazaar_max_ware_size

# Set size cap to 100 MB
wp option update bazaar_max_ware_size 104857600
```

</details>

<details>
<summary><strong>Test data</strong></summary>

```bash
# Seed 50 posts for your ware to consume
wp post generate --count=50 --post_type=post

# Create a test editor
wp user create test-editor editor@example.com --role=editor --user_pass=password

# Flush caches after manual registry edits
wp cache flush && wp transient delete --all
```

</details>

<details>
<summary><strong>Debug log</strong></summary>

```bash
# Requires WP_DEBUG_LOG=true in wp-config.php (or .wp-env.json)
tail -f "$(wp eval 'echo WP_CONTENT_DIR;')/debug.log"
```

</details>

---

## Must-Have WP-CLI Packages

Install once, use everywhere:

```bash
wp package install schlessera/wp-cli-psysh         # PsySH REPL (replaces wp shell)
wp package install aaemnnosttv/wp-cli-login-command # magic login links
wp package install wp-cli/doctor-command            # site health checks
wp package install alleyinteractive/wp-doc-command  # PHPDoc in the terminal
```

| Package | What it does |
|:---|:---|
| `schlessera/wp-cli-psysh` | Replaces `wp shell` with a full-featured REPL: tab completion, history, `ls`, `doc` |
| `aaemnnosttv/wp-cli-login-command` | `wp login create admin` — generates a magic login URL, no password needed |
| `wp-cli/doctor-command` | `wp doctor check --all` — automated site health audit |
| `alleyinteractive/wp-doc-command` | `wp doc update_option` — read WordPress PHPDoc without leaving the terminal |

---

## Shell Aliases Worth Adding

```bash
# ~/.zshrc or ~/.bashrc

# Bazaar
alias wbl='wp bazaar list'
alias wbi='wp bazaar install'
alias wbe='wp bazaar enable'
alias wbd='wp bazaar disable'
alias wbx='wp bazaar delete'
alias wbn='wp bazaar info'

# General WP-CLI
alias wpl='wp plugin list'
alias wpu='wp core update && wp plugin update --all && wp theme update --all'
alias wpdb='wp db export "$(date +%Y%m%d-%H%M%S)-backup.sql" && echo "Backup saved"'
alias wplog='tail -f "$(wp eval "echo WP_CONTENT_DIR;")/debug.log"'
alias wpsh='wp shell'
```

---

## Further Reading

- [WP-CLI official docs](https://wp-cli.org/)
- [WP-CLI command reference](https://developer.wordpress.org/cli/commands/)
- [WP-CLI packages on Packagist](https://packagist.org/?tags=wp-cli-package)
- [Bazaar WP-CLI commands](WP-CLI.md)
