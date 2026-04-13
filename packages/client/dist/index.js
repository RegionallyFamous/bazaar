/**
 * @bazaar/client
 *
 * TypeScript client library for building WordPress wares with the Bazaar plugin.
 *
 * Main exports (no React required):
 *   - getBazaarContext()  — nonce, restUrl, slug, adminColor
 *   - setBazaarContext()  — seed context values in dev mode
 *   - wpFetch()           — authenticated fetch wrapper
 *   - wpJson()            — fetch + JSON parse + error throwing
 *   - WpApiError          — typed error class
 *   - createStore()       — server-backed per-user key-value storage
 *   - createConfig()      — manifest-declared ware settings
 *   - createWebhooks()    — register outbound webhooks
 *   - createJobs()        — list / trigger background jobs
 *   - copy() / paste()    — inter-ware clipboard
 *
 * React hooks live in the subpath export:
 *   import { useCurrentUser, useWpFetch, useWpPosts } from '@bazaar/client/react'
 */
export { getBazaarContext, setBazaarContext, resetBazaarContext, refreshNonce, startNonceRefresh, stopNonceRefresh } from './context.js';
export { wpFetch, wpJson, WpApiError } from './fetch.js';
export { bzr, onShellRoute } from './bus.js';
export { wpCachedFetch } from './cache.js';
export { createStore } from './store.js';
export { createWaredStore } from './local-store.js';
export { createConfig } from './config.js';
export { createWebhooks } from './webhooks.js';
export { createJobs } from './jobs.js';
export { copy as bzrCopy, paste as bzrPaste } from './clipboard.js';
//# sourceMappingURL=index.js.map