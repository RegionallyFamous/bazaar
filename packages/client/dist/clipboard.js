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
let _pasteSeq = 0;
/**
 * Copy `data` to the inter-ware clipboard.
 * @param data   Any JSON-serialisable value.
 * @param mime   Optional MIME hint so the pasting ware can sanity-check the type.
 */
export function copy(data, mime = 'application/json') {
    window.parent.postMessage({ type: 'bazaar:copy', data, mime }, window.location.origin);
}
/**
 * Paste from the inter-ware clipboard.
 * @param mime Optional expected MIME — if the clipboard contains a different type, `null` is returned.
 * @returns The copied data, or `null` if nothing has been copied (or type mismatch).
 */
export async function paste(mime) {
    return new Promise((resolve, reject) => {
        const id = `paste_${++_pasteSeq}`;
        const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('bzr.paste timed out')); }, 3000);
        const handler = (e) => {
            if (e.data?.type !== 'bazaar:paste-response' || e.data?.id !== id)
                return;
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(e.data?.data);
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({ type: 'bazaar:paste', id, mime }, window.location.origin);
    });
}
//# sourceMappingURL=clipboard.js.map