/**
 * Bazaar shared bundle — react/jsx-runtime.
 *
 * Re-exported as an ES module so wares that mark 'react/jsx-runtime' as
 * external can resolve the bare specifier via the shell's injected importmap.
 *
 * Named exports are declared explicitly because Vite's CJS→ESM wrapping does
 * not forward re-exports through `export *` for CommonJS subpath entries.
 */
export { jsx, jsxs, Fragment } from 'react/jsx-runtime';
