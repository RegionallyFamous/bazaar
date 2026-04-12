/**
 * @bazaar/client — shared TypeScript interfaces.
 */

/**
 * Minimal config required by client service factories (store, config, webhooks, jobs).
 * In practice these values come from `getBazaarContext()`.
 */
export interface BazaarClientConfig {
  restUrl: string;
  nonce:   string;
}

/** Everything a ware needs to communicate with its WordPress host. */
export interface BazaarContext {
  /** wp_rest nonce for authenticating REST requests. */
  nonce: string;
  /** WordPress REST API base URL, e.g. "https://example.com/wp-json". */
  restUrl: string;
  /** Base URL of this ware's file-serve endpoint (without trailing slash). */
  serveUrl: string;
  /** This ware's slug, e.g. "ledger". */
  slug: string;
  /**
   * WordPress admin colour scheme name (e.g. "fresh", "midnight", "ectoplasm").
   * Injected by Bazaar as the _adminColor query param so wares can optionally
   * match the admin palette.
   */
  adminColor: string;
}

/** Minimal WordPress user shape returned by /wp/v2/users/me. */
export interface WpUser {
  id: number;
  name: string;
  slug: string;
  email?: string;
  roles: string[];
  avatar_urls: Record<string, string>;
  capabilities: Record<string, boolean>;
}

/** Minimal WordPress post shape returned by /wp/v2/posts. */
export interface WpPost {
  id: number;
  date: string;
  slug: string;
  status: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string; protected: boolean };
  excerpt: { rendered: string; protected: boolean };
  author: number;
  featured_media: number;
  type: string;
}

/** Query parameters accepted by /wp/v2/posts (and most collection endpoints). */
export interface WpPostQuery {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  type?: string;
  author?: number | number[];
  order?: 'asc' | 'desc';
  orderby?: string;
  [key: string]: unknown;
}
