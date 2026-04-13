/**
 * bzr.webhook — register outbound webhooks for bus events.
 *
 * @example
 * const wh = createWebhooks('my-ware');
 * const hook = await wh.register('order.created', 'https://n8n.example.com/webhook/abc', 'my-secret');
 * await wh.list();
 * await wh.remove(hook.id);
 */
export function createWebhooks(slug, config) {
    const base = `${config.restUrl}/bazaar/v1/webhooks/${encodeURIComponent(slug)}`;
    const hdr = { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' };
    return {
        async list() {
            const r = await fetch(base, { headers: hdr });
            if (!r.ok)
                throw new Error(`bzr.webhooks [GET] → ${r.status}`);
            return r.json();
        },
        async register(event, url, secret) {
            const r = await fetch(base, {
                method: 'POST',
                headers: hdr,
                body: JSON.stringify({ event, url, ...(secret ? { secret } : {}) }),
            });
            if (!r.ok)
                throw new Error(`bzr.webhooks [POST] → ${r.status}`);
            return r.json();
        },
        async remove(id) {
            const r = await fetch(`${base}/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: hdr,
            });
            if (!r.ok)
                throw new Error(`bzr.webhooks [DELETE] → ${r.status}`);
        },
    };
}
//# sourceMappingURL=webhooks.js.map