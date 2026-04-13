/**
 * main.tsx — ware entry point.
 *
 * This file does exactly three things, in order:
 *   1. Seed @bazaar/client context for local development (dev only).
 *   2. Apply the WordPress admin colour scheme to design tokens.
 *   3. Mount the React app inside <div id="root">.
 *
 * Keep this file thin — all real logic lives in App.tsx and below.
 */

import { StrictMode }                        from 'react';
import { createRoot }                        from 'react-dom/client';
import { getBazaarContext, setBazaarContext } from '@bazaar/client';
import { applyAdminColor }                   from '@bazaar/design/theme';
import { ErrorBoundary }                     from '@bazaar/design';

// Always import the design CSS. It activates the --bw-* token layer that
// every @bazaar/design component depends on.
import '@bazaar/design/css';

import App from './App.tsx';

// ─── 1. Dev-mode context seed ────────────────────────────────────────────────
//
// In production the ware runs inside a Bazaar iframe whose URL contains the
// nonce and REST base. @bazaar/client extracts them automatically.
//
// When developing locally (`npm run dev`) there is no Bazaar iframe, so we
// seed the context manually from Vite env vars. Create `.env.local` with:
//
//   VITE_WP_NONCE=<get via: wp eval 'echo wp_create_nonce("wp_rest");'>
//   VITE_WP_REST_URL=https://your-local-site.local/wp-json
//
if ( import.meta.env.DEV ) {
  setBazaarContext( {
    nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
    restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
    // Slug is used by createStore() and createJobs() to namespace data.
    slug: 'hello',
  } );
}

// ─── 2. Admin colour scheme ──────────────────────────────────────────────────
//
// WordPress lets each user pick a colour scheme (Fresh, Midnight, Sunrise, …).
// Bazaar injects it as ?_adminColor=fresh in the iframe URL. applyAdminColor()
// maps it to CSS custom properties on <html> so components can match the admin.
//
// You can omit this call if your ware has a fixed colour palette.
applyAdminColor( getBazaarContext().adminColor );

// ─── 3. Mount ────────────────────────────────────────────────────────────────
//
// Always wrap <App> in <ErrorBoundary>. Without it, an unhandled render error
// leaves the user with a blank iframe and no feedback.
const root = document.getElementById( 'root' );
if ( root ) {
  createRoot( root ).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
