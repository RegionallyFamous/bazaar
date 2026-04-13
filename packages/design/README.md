# @bazaar/design

Shared UI component library and design tokens for Bazaar wares.

## Components

| Component | Description |
|-----------|-------------|
| `Button` | Action button with `default`, `primary`, `danger`, `ghost` variants and `sm`/`md`/`lg` sizes. |
| `Input` / `Textarea` / `Select` | Controlled form inputs that inherit the Catppuccin Mocha palette. |
| `Modal` | Accessible dialog with `sm`/`md`/`lg`/`xl` sizes. |
| `Badge` | Status badge with `default`, `success`, `warning`, `danger`, `info` variants. |
| `Spinner` | Loading indicator with `sm`/`md`/`lg` sizes. |
| `ToastProvider` / `useToast` | Toast notification system — wrap your app root in `<ToastProvider>`. |
| `ErrorBoundary` | React error boundary with a fallback slot. |

## Theme

`applyAdminColor(adminColor)` applies the WordPress admin colour scheme as CSS custom properties on a target element, letting wares optionally match the admin palette.

`getAccentPalette(adminColor)` returns the accent token set (`primary`, `secondary`, `muted`) for a given scheme name.

## Usage

```tsx
import { Button, Modal, useToast } from '@bazaar/design';
import '@bazaar/design/style';
```

Always import the stylesheet at the ware entry point so tokens and component styles are available.

## Dev / build

```bash
# From the monorepo root:
npm run build --workspace=packages/design

# Type-check only:
cd packages/design && npx tsc --noEmit
```

The package builds to `dist/` via Vite library mode. The `dist/` directory is committed so wares can import `@bazaar/design` without a build step during development.
