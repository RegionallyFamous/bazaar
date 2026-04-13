/**
 * bzr.copy / bzr.paste — inter-ware clipboard via shell broker.
 *
 * Wares cannot directly share memory, but they can exchange data through
 * the shell using postMessage. The shell holds the clipboard state.
 *
 * @example
 * // In ware A:
 * bzr.copy({ type: 'order', id: 42 });
 *
 * // In ware B:
 * const data = await bzr.paste<{ type: string; id: number }>();
 */
type JsonValue = unknown;
/**
 * Copy `data` to the inter-ware clipboard.
 * @param data   Any JSON-serialisable value.
 * @param mime   Optional MIME hint so the pasting ware can sanity-check the type.
 */
export declare function copy(data: JsonValue, mime?: string): void;
/**
 * Paste from the inter-ware clipboard.
 * @param mime Optional expected MIME — if the clipboard contains a different type, `null` is returned.
 * @returns The copied data, or `null` if nothing has been copied (or type mismatch).
 */
export declare function paste<T = JsonValue>(mime?: string): Promise<T | null>;
export {};
//# sourceMappingURL=clipboard.d.ts.map