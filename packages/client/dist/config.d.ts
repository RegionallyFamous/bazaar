/**
 * bzr.config — manifest-driven ware settings API.
 *
 * Reads and writes config values via the Bazaar Config REST endpoint.
 * The admin can configure the settings in the Bazaar Manage screen;
 * wares read them at runtime.
 *
 * @example
 * const config = createConfig('my-ware');
 * const { values, schema } = await config.getAll();
 * const apiKey = await config.get<string>('api_key');
 * await config.set('theme', 'dark');   // admin only
 */
import type { BazaarClientConfig } from './types.js';
type JsonValue = string | number | boolean | null;
export interface ConfigField {
    key: string;
    type: 'text' | 'number' | 'checkbox' | 'select' | 'textarea';
    label: string;
    required?: boolean;
    default?: JsonValue;
    options?: string[];
}
export interface WareConfig {
    /** Get a single config value. */
    get<T extends JsonValue = string>(key: string): Promise<T | undefined>;
    /** Get all config values + schema. */
    getAll(): Promise<{
        schema: ConfigField[];
        values: Record<string, JsonValue>;
    }>;
    /** Update one or more config values (admin only). */
    set(values: Record<string, JsonValue>): Promise<void>;
    /** Reset a key to its manifest default (admin only). */
    reset(key: string): Promise<void>;
}
/**
 * Create a config client scoped to `slug`.
 *
 * Reads and writes settings declared in the `settings` array in `manifest.json`.
 * Admins can configure these in the Bazaar Manage screen; wares read them at runtime.
 *
 * @param slug    The ware slug (use `getBazaarContext().slug`).
 * @param config  Client config from `getBazaarContext()`.
 *
 * @example
 * import { createConfig, getBazaarContext } from '@bazaar/client';
 * const ctx    = getBazaarContext();
 * const config = createConfig( ctx.slug, ctx );
 *
 * const apiKey = await config.get<string>( 'api_key' );       // string | undefined
 * await config.set( { api_key: 'sk_live_abc' } );             // admin only
 * const { schema, values } = await config.getAll();
 */
export declare function createConfig(slug: string, config: BazaarClientConfig): WareConfig;
export {};
//# sourceMappingURL=config.d.ts.map