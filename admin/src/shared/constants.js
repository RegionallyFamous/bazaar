/**
 * Shared timing and sizing constants.
 *
 * Centralised here so magic numbers don't scatter across shell.js and main.js.
 * Import only the constants you need — tree-shaking eliminates the rest.
 */

/** Debounce delay (ms) for the command palette search input. */
export const PALETTE_DEBOUNCE_MS = 150;

/** Debounce delay (ms) for the nav-rail filter and the gallery search. */
export const SEARCH_DEBOUNCE_MS = 80;

/** Minimum query length before federated (per-ware) search fires. */
export const FED_SEARCH_MIN_CHARS = 2;

/** Abort timeout (ms) for individual federated search fetch calls. */
export const FED_SEARCH_TIMEOUT_MS = 2000;

/** Polling interval (ms) for badge-count refreshes. */
export const BADGE_POLL_INTERVAL_MS = 30_000;

/** Polling interval (ms) for health-check refreshes. */
export const HEALTH_POLL_INTERVAL_MS = 60_000;

/** Maximum age (ms) of a data-cache entry before it is considered stale. */
export const DATA_CACHE_TTL_MS = 60_000;

/** Maximum number of entries in the shell data-cache map. */
export const DATA_CACHE_MAX = 200;

/** Default duration (ms) for success toast notifications. */
export const TOAST_DEFAULT_MS = 3000;

/** Duration (ms) for upload-error notices before auto-hide. */
export const UPLOAD_ERROR_HIDE_MS = 8000;

/** Duration (ms) for upload-success notices before auto-hide. */
export const UPLOAD_SUCCESS_HIDE_MS = 5000;

/** Countdown (seconds) before the delete-confirm strip auto-cancels. */
export const DELETE_CONFIRM_COUNTDOWN_S = 5;
