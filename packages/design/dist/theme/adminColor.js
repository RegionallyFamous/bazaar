/**
 * Maps WordPress admin colour scheme slugs to --bw-accent overrides.
 *
 * WP ships these built-in colour schemes:
 *   fresh, light, modern, blue, coffee, ectoplasm, midnight, ocean, sunrise
 *
 * The mapping intentionally favours clean, accessible accent colours that
 * complement the admin's nav colour rather than exactly reproducing it.
 */
const ADMIN_COLOR_MAP = {
    fresh: {
        accent: '#2271b1',
        accentHi: '#135e96',
        accentBg: '#dbeafe',
        accentRgb: '34, 113, 177',
    },
    light: {
        accent: '#2271b1',
        accentHi: '#135e96',
        accentBg: '#dbeafe',
        accentRgb: '34, 113, 177',
    },
    modern: {
        accent: '#3858e9',
        accentHi: '#2042cc',
        accentBg: '#eef2ff',
        accentRgb: '56, 88, 233',
    },
    blue: {
        accent: '#096484',
        accentHi: '#075068',
        accentBg: '#e0f2fe',
        accentRgb: '9, 100, 132',
    },
    coffee: {
        accent: '#c7a589',
        accentHi: '#a8836a',
        accentBg: '#fdf4ee',
        accentRgb: '199, 165, 137',
    },
    ectoplasm: {
        accent: '#a3b745',
        accentHi: '#849636',
        accentBg: '#f7fee7',
        accentRgb: '163, 183, 69',
    },
    midnight: {
        accent: '#e14d43',
        accentHi: '#c73d34',
        accentBg: '#fee2e2',
        accentRgb: '225, 77, 67',
    },
    ocean: {
        accent: '#9ebaa0',
        accentHi: '#7d9e80',
        accentBg: '#f0fdf4',
        accentRgb: '158, 186, 160',
    },
    sunrise: {
        accent: '#dd823b',
        accentHi: '#c06b26',
        accentBg: '#fff7ed',
        accentRgb: '221, 130, 59',
    },
};
const FALLBACK = ADMIN_COLOR_MAP.fresh;
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
export function applyAdminColor(adminColor) {
    const palette = ADMIN_COLOR_MAP[adminColor] ?? FALLBACK;
    const root = document.documentElement;
    root.style.setProperty('--bw-accent', palette.accent);
    root.style.setProperty('--bw-accent-hi', palette.accentHi);
    root.style.setProperty('--bw-accent-bg', palette.accentBg);
    root.style.setProperty('--bw-accent-rgb', palette.accentRgb);
}
/** Return the accent palette for a given adminColor slug (useful for imperative colour work). */
export function getAccentPalette(adminColor) {
    return ADMIN_COLOR_MAP[adminColor] ?? FALLBACK;
}
//# sourceMappingURL=adminColor.js.map