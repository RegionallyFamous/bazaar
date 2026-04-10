# WordPress Shell — WP-CLI Power Guide

WP-CLI is the command-line interface for WordPress. For Bazaar developers it's indispensable: install wares, inspect the registry, test REST endpoints, seed data, and automate entire deployment pipelines without touching the browser.

This guide covers the patterns and tricks that will save you the most time.

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

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# WP-CLI tab completion
source "$(wp cli completions --shell=bash)"   # bash
source "$(wp cli completions --shell=zsh)"    # zsh
```

### Set a default path

If you always run WP-CLI from the same WordPress install, set it in `~/.wp-cli/config.yml`:

```yaml
path: /var/www/html
```

---

## The Interactive Shell

`wp shell` drops you into an interactive PHP REPL with the full WordPress environment loaded. Think of it as `php -a` but with every WordPress function, class, and global already available.

```bash
wp shell
```

```php
# Inside the shell:
wp> get_option('blogname');
= "My WordPress Site"

wp> $user = get_user_by('login', 'admin'); $user->display_name;
= "admin"

wp> update_option('bazaar_max_ware_size', 100 * 1024 * 1024);
= true

wp> get_option('bazaar_registry');
= "{\"invoice-generator\":{\"name\":\"Invoice Generator\",...}}"
```

### Upgrade to PsySH (strongly recommended)

The default `wp shell` is basic. PsySH gives you tab completion, syntax highlighting, command history, `ls` to browse objects, and `doc` to read PHPDocs inline.

```bash
wp package install schlessera/wp-cli-psysh
wp shell        # now uses PsySH automatically
```

Inside PsySH:

```php
# Tab complete any WordPress function
wp> get_op<TAB>   # expands to get_option

# Browse an object's properties and methods
wp> ls $post

# Read PHPDoc without leaving the terminal
wp> doc get_option

# Dump a variable with syntax highlighting
wp> var_dump(get_option('bazaar_registry'));
```

---

## Inspecting Bazaar from the Shell

### Read the ware registry directly

```bash
wp eval 'echo json_encode(json_decode(get_option("bazaar_registry"), true), JSON_PRETTY_PRINT);'
```

### Check what's stored for a specific ware

```bash
wp eval '
$registry = json_decode(get_option("bazaar_registry"), true);
print_r($registry["invoice-generator"] ?? "not found");
'
```

### Clear the registry (nuclear reset)

```bash
wp eval 'delete_option("bazaar_registry");'
# Then re-install your wares
```

### Check what files are in a ware directory

```bash
find $(wp eval 'echo WP_CONTENT_DIR;')/bazaar/invoice-generator/ -type f
```

### Test a REST endpoint with authentication

```bash
# Get the nonce
NONCE=$(wp eval 'echo wp_create_nonce("wp_rest");')
SITE=$(wp option get siteurl)

# Hit the file server
curl -s -H "X-WP-Nonce: $NONCE" \
  "${SITE}/wp-json/bazaar/v1/serve/invoice-generator/index.html" | head -20

# Upload a ware
curl -s -X POST \
  -H "X-WP-Nonce: $NONCE" \
  -F "file=@invoice-generator.wp" \
  "${SITE}/wp-json/bazaar/v1/wares" | jq .
```

---

## `wp eval` and `wp eval-file`

These two commands are the most powerful in WP-CLI for Bazaar developers.

### `wp eval` — one-liners

Execute a PHP snippet in the WordPress context:

```bash
# Get the size of the ware registry option
wp eval 'echo strlen(get_option("bazaar_registry")) . " bytes\n";'

# List all installed wares
wp eval '
foreach (json_decode(get_option("bazaar_registry"), true) as $slug => $ware) {
    echo $ware["enabled"] ? "✓" : "✗";
    echo " {$slug} (v{$ware["version"]})\n";
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

For anything longer than a few lines, put it in a `.php` file and run it:

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

### Site aliases

Define aliases for all your environments in `~/.wp-cli/config.yml`:

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

Run any command on any environment:

```bash
wp @production bazaar list
wp @staging bazaar install invoice-generator.wp --force
wp @local bazaar delete old-ware --yes
```

### Sync wares between environments

```bash
#!/usr/bin/env bash
# Export enabled wares from production and install on staging.

SLUGS=$(wp @production bazaar list --status=enabled --fields=slug --format=csv | tail -n +2)

for slug in $SLUGS; do
  # Create a temp .wp file from the installed files
  SRC=$(wp @production eval "echo WP_CONTENT_DIR . '/bazaar/${slug}';")
  ssh deploy@production.example.com "cd ${SRC} && zip -r /tmp/${slug}.wp ."
  scp deploy@production.example.com:/tmp/${slug}.wp /tmp/${slug}.wp
  wp @staging bazaar install /tmp/${slug}.wp --force
  rm /tmp/${slug}.wp
done
```

---

## Automation Recipes

### Morning health check

```bash
#!/usr/bin/env bash
# Run this as a daily cron job. Sends a summary of ware status.

ENABLED=$(wp bazaar list --status=enabled --format=count)
DISABLED=$(wp bazaar list --status=disabled --format=count)

echo "Bazaar status: ${ENABLED} enabled, ${DISABLED} disabled"
wp bazaar list --format=table
```

### Automated ware deployment in CI/CD (GitHub Actions)

```yaml
- name: Deploy wares to production
  run: |
    npm run package
    ssh ${{ secrets.PROD_HOST }} \
      "wp bazaar install /tmp/my-ware.wp --force --path=/var/www/html"
  env:
    SSH_KEY: ${{ secrets.PROD_SSH_KEY }}
```

### Validate a .wp file before deploying

```bash
#!/usr/bin/env bash
# Dry-run validation: install on staging, check it works, then install on prod.

FILE="$1"

echo "Installing on staging..."
wp @staging bazaar install "$FILE" --force

echo "Running smoke test..."
SLUG=$(unzip -p "$FILE" manifest.json | python3 -c "import sys,json; print(json.load(sys.stdin)['slug'])")
STATUS=$(wp @staging bazaar list --fields=slug,status --format=json | \
  python3 -c "import sys,json; wares=json.load(sys.stdin); print(next(w['status'] for w in wares if w['slug']=='${SLUG}'))")

if [ "$STATUS" != "enabled" ]; then
  echo "Smoke test failed. Ware status: $STATUS"
  exit 1
fi

echo "Staging OK. Deploying to production..."
wp @production bazaar install "$FILE" --force
echo "Done."
```

---

## Useful WP-CLI Commands for Ware Developers

Beyond Bazaar's own commands, these core WP-CLI commands are especially useful during ware development.

### Database

```bash
# Snapshot the DB before a risky operation
wp db export pre-migration.sql

# Search for Bazaar data specifically
wp db query "SELECT option_value FROM wp_options WHERE option_name = 'bazaar_registry'\G"

# Find and replace URLs (handles serialized data correctly)
wp search-replace 'http://old-site.com' 'https://new-site.com' --dry-run
wp search-replace 'http://old-site.com' 'https://new-site.com'
```

### REST API inspection

```bash
# List all registered REST routes
wp rest route list --format=table

# Confirm Bazaar's routes are registered
wp rest route list --format=json | grep bazaar

# Make an authenticated GET request
wp eval '
$request  = new WP_REST_Request("GET", "/bazaar/v1/serve/invoice-generator/index.html");
$response = rest_do_request($request);
echo $response->get_status() . "\n";
'
```

### Options inspection

```bash
# Check Bazaar options
wp option get bazaar_registry
wp option get bazaar_max_ware_size

# Set the size limit (in bytes — this sets it to 100 MB)
wp option update bazaar_max_ware_size 104857600
```

### Caching

```bash
# Flush everything after manually editing the registry
wp cache flush
wp transient delete --all
```

### Generate test content for your ware

```bash
# Seed 50 posts so your ware has data to work with
wp post generate --count=50 --post_type=post

# Create a test user with editor role
wp user create test-editor editor@example.com --role=editor --user_pass=password

# Create custom taxonomy terms
wp term create category "Invoices" --description="Invoice category"
```

### Tail the debug log

```bash
# Requires WP_DEBUG_LOG=true in wp-config.php
tail -f $(wp eval 'echo WP_CONTENT_DIR;')/debug.log
```

---

## Must-Have WP-CLI Packages

Install these globally once and use them on every project:

```bash
# Better REPL (replaces wp shell)
wp package install schlessera/wp-cli-psysh

# Magic login links — share a login URL without sharing credentials
wp package install aaemnnosttv/wp-cli-login-command

# Site health checks
wp package install wp-cli/doctor-command

# Read WordPress function PHPDocs in the terminal
wp package install alleyinteractive/wp-doc-command
```

**Usage examples:**

```bash
# Generate a magic login link for admin
wp login create admin

# Run all health checks
wp doctor check --all

# Read PHPDoc for update_option
wp doc update_option
```

---

## Shell Aliases Worth Adding

Add these to your `~/.zshrc` or `~/.bashrc`:

```bash
# Bazaar shortcuts
alias wbl='wp bazaar list'
alias wbi='wp bazaar install'
alias wbe='wp bazaar enable'
alias wbd='wp bazaar disable'
alias wbx='wp bazaar delete'

# General WP-CLI shortcuts
alias wpl='wp plugin list'
alias wpu='wp core update && wp plugin update --all && wp theme update --all'
alias wpdb='wp db export $(date +%Y%m%d-%H%M%S)-backup.sql && echo "Backup done"'
alias wplog='tail -f $(wp eval "echo WP_CONTENT_DIR;")/debug.log'
```

---

## Further Reading

- [WP-CLI official docs](https://wp-cli.org/)
- [WP-CLI command reference](https://developer.wordpress.org/cli/commands/)
- [WP-CLI packages directory](https://packagist.org/?tags=wp-cli-package)
- [Bazaar WP-CLI commands](WP-CLI.md)
