# @bazaar/client

TypeScript client library for building WordPress wares with the [Bazaar](https://github.com/nickhblair/bazaar) plugin.

```bash
npm install @bazaar/client
```

---

## What it does

Every ware runs in an authenticated iframe inside `wp-admin`. This library handles the boring parts:

- Extracting the `_wpnonce` from the iframe URL
- Resolving the WordPress REST base URL
- Adding `X-WP-Nonce` to every fetch call automatically
- Providing React hooks for common WordPress data

---

## Usage

### Core (framework-agnostic)

```ts
import { getBazaarContext, wpJson } from '@bazaar/client';

const ctx = getBazaarContext();
// { nonce, restUrl, serveUrl, slug, adminColor }

// Fetch any WordPress REST endpoint — nonce added automatically
const posts = await wpJson<WpPost[]>('/wp/v2/posts?per_page=5');
```

### React hooks

```tsx
import { useCurrentUser, useWpPosts } from '@bazaar/client/react';

function App() {
  const user  = useCurrentUser();
  const { posts, loading } = useWpPosts({ per_page: 10, status: 'publish' });

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <p>Hello, {user?.name}</p>
      {posts.map(p => <h2 key={p.id}>{p.title.rendered}</h2>)}
    </div>
  );
}
```

---

## Dev mode

When running with a Vite dev server (`npm run dev`), the ware isn't inside the Bazaar iframe so context can't be auto-detected. Seed it manually in your entry point:

```ts
// src/main.tsx
import { setBazaarContext } from '@bazaar/client';

if (import.meta.env.DEV) {
  setBazaarContext({
    nonce:    import.meta.env.VITE_WP_NONCE    ?? '',
    restUrl:  import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
    slug:     import.meta.env.VITE_BAZAAR_SLUG ?? 'my-ware',
  });
}
```

Create `.env.local` in your ware project:

```
VITE_WP_NONCE=get_this_from_wp_eval
VITE_WP_REST_URL=https://your-local-site.local/wp-json
VITE_BAZAAR_SLUG=my-ware
```

Get a fresh nonce with: `wp eval 'echo wp_create_nonce("wp_rest");'`

---

## API Reference

### `getBazaarContext(): BazaarContext`

Returns the current ware's context. Cached after first call.

### `setBazaarContext(partial: Partial<BazaarContext>): void`

Override context values. Call before `getBazaarContext()` for dev mode setup.

### `wpFetch(path, init?): Promise<Response>`

Authenticated `fetch` wrapper. Adds `X-WP-Nonce` header and resolves paths relative to `restUrl`.

### `wpJson<T>(path, init?): Promise<T>`

Like `wpFetch` but parses JSON and throws `WpApiError` on non-2xx responses.

### `useCurrentUser(): WpUser | null`

React hook. Returns the logged-in user or null while loading.

### `useWpFetch<T>(path): UseQueryResult<T>`

React hook. Fetches any REST endpoint and returns `{ data, loading, error, refetch }`.

### `useWpPosts(query?): UseWpPostsResult`

React hook. Returns `{ posts, loading, error, refetch }`.
