# WordPress Rock-Solid — Cursor Rules

Production-grade WordPress plugin + Gutenberg block standards (VIP / enterprise tier).

## Installation

Copy the `.cursor/rules/` folder into the root of your WordPress plugin project. That's it — Cursor picks them up automatically.

```
your-plugin/
├── .cursor/
│   └── rules/
│       ├── wordpress-core.mdc      ← always active
│       ├── gutenberg-blocks.mdc    ← activates on block files
│       ├── rest-api.mdc            ← activates on API/endpoint files
│       ├── i18n.mdc                ← activates on PHP/JS files (description-triggered)
│       └── testing.mdc             ← activates on test files
├── src/
├── build/
└── ...
```

## How it works

Each `.mdc` file uses Cursor's rule system:

- **wordpress-core.mdc** — `alwaysApply: true`. Security, performance, structure, tooling, and the verification loop. Active on every prompt.
- **gutenberg-blocks.mdc** — Glob-scoped to `**/blocks/**`. Block.json, edit.js patterns, dynamic vs static, registration, pitfalls. Only loads when you're working on block files.
- **rest-api.mdc** — Glob-scoped to API/endpoint directories. Route registration, permission callbacks, schemas, api-fetch.
- **i18n.mdc** — Description-triggered. Text domains, translator comments, JS translation pipeline.
- **testing.mdc** — Glob-scoped to test files. WP-Browser, Brain Monkey, Jest, Playwright, CI.

## Standards covered

- WordPress VIP Coding Standards (WPCS, VIPCS)
- PHPStan level 6+ with szepeviktor/phpstan-wordpress
- @wordpress/eslint-plugin
- Sanitize-early, escape-late security model
- WP_Query performance optimization
- Gutenberg block.json apiVersion 3
- REST API best practices
- Full i18n pipeline (PHP + JS + block.json)
- Testing pyramid (unit → integration → E2E)

## Customization

- Edit the `globs` field in any `.mdc` frontmatter to match your project's directory structure
- Edit `wordpress-core.mdc` to adjust the strictness level or add project-specific rules
- Add new `.mdc` files for project-specific patterns (WooCommerce, ACF, etc.)
