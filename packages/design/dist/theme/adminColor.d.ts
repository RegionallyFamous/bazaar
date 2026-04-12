/**
 * Maps WordPress admin colour scheme slugs to --bw-accent overrides.
 *
 * WP ships these built-in colour schemes:
 *   fresh, light, modern, blue, coffee, ectoplasm, midnight, ocean, sunrise
 *
 * The mapping intentionally favours clean, accessible accent colours that
 * complement the admin's nav colour rather than exactly reproducing it.
 */
interface AccentPalette {
    accent: string;
    accentHi: string;
    accentBg: string;
    accentRgb: string;
}
/**
 * Apply the WP admin colour scheme as `--bw-accent` overrides on `:root`.
 *
 * Call this once near the top of a ware's entry point, after importing
 * `@bazaar/design/css`.
 *
 * @example
 * ```ts
 * import { applyAdminColor } from '@bazaar/design/theme';
 * import { getBazaarContext } from '@bazaar/client';
 *
 * applyAdminColor( getBazaarContext().adminColor );
 * ```
 *
 * Calling this is optional — wares that want a fixed accent colour can simply
 * override the --bw-accent* tokens themselves.
 */
export declare function applyAdminColor(adminColor: string): void;
/** Return the accent palette for a given adminColor slug (useful for imperative colour work). */
export declare function getAccentPalette(adminColor: string): AccentPalette;
export {};
//# sourceMappingURL=adminColor.d.ts.map