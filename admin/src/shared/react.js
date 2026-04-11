/**
 * Bazaar shared bundle — React.
 *
 * Re-exported as an ES module so the shell can host a single versioned copy
 * that all ware iframes reference via the injected importmap. The content-hashed
 * URL is cached by the browser after the first load; subsequent iframes get the
 * compiled bytecode from the V8 code cache with zero re-download.
 */
export * from 'react';
export { default } from 'react';
