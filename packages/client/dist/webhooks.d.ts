/**
 * bzr.webhook — register outbound webhooks for bus events.
 *
 * @example
 * const wh = createWebhooks('my-ware');
 * const hook = await wh.register('order.created', 'https://n8n.example.com/webhook/abc', 'my-secret');
 * await wh.list();
 * await wh.remove(hook.id);
 */
import type { BazaarClientConfig } from './types.js';
export interface Webhook {
    id: string;
    slug: string;
    event: string;
    url: string;
    created_at: number;
}
export interface WareWebhooks {
    /** List all registered webhooks. */
    list(): Promise<Webhook[]>;
    /** Register a new webhook. Returns the created webhook. */
    register(event: string, url: string, secret?: string): Promise<Webhook>;
    /** Remove a webhook by id. */
    remove(id: string): Promise<void>;
}
export declare function createWebhooks(slug: string, config: BazaarClientConfig): WareWebhooks;
//# sourceMappingURL=webhooks.d.ts.map