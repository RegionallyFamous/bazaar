# Recipes

Copy-paste patterns for the most common ware tasks. Each recipe is a complete, working snippet — no narrative filler.

---

## Table of Contents

- [Fetch WordPress posts](#fetch-wordpress-posts)
- [Read and write WordPress options](#read-and-write-wordpress-options)
- [Show a toast notification](#show-a-toast-notification)
- [Persist data with the Bazaar store (server-backed)](#persist-data-with-the-bazaar-store-server-backed)
- [Persist data locally (localStorage)](#persist-data-locally-localstorage)
- [Call a custom REST endpoint](#call-a-custom-rest-endpoint)
- [Navigate to another ware](#navigate-to-another-ware)
- [Emit and receive inter-ware events](#emit-and-receive-inter-ware-events)
- [Update the shell nav badge](#update-the-shell-nav-badge)
- [Trigger a background job from the UI](#trigger-a-background-job-from-the-ui)
- [Ware settings backed by manifest config schema](#ware-settings-backed-by-manifest-config-schema)
- [Upload a file to WordPress media library](#upload-a-file-to-wordpress-media-library)
- [Use the design system toast with context](#use-the-design-system-toast-with-context)
- [Handle REST errors gracefully](#handle-rest-errors-gracefully)
- [Deep-link routing with the shell](#deep-link-routing-with-the-shell)

---

## Fetch WordPress posts

```tsx
import { useWpPosts } from '@bazaar/client/react';
import type { WpPost } from '@bazaar/client';

export default function PostList(): React.JSX.Element {
  const { posts, loading, error, refetch } = useWpPosts( {
    per_page: 20,
    status:   'publish',
    orderby:  'date',
    order:    'desc',
  } );

  if ( loading ) return <p>Loading…</p>;
  if ( error )   return <p>Error: { error.message } <button onClick={ refetch }>Retry</button></p>;

  return (
    <ul>
      { posts.map( ( p: WpPost ) => (
        <li key={ p.id }>{ p.title.rendered }</li>
      ) ) }
    </ul>
  );
}
```

---

## Read and write WordPress options

WordPress options are exposed via `/wp/v2/settings`. The user must have `manage_options` capability.
Declare `"permissions": ["read:options", "write:options"]` in `manifest.json`.

```ts
import { wpJson } from '@bazaar/client';

// Read
const settings = await wpJson<Record<string, unknown>>( '/wp/v2/settings' );
const siteTitle = settings.title as string;

// Write (PATCH only touches the keys you send)
await wpJson( '/wp/v2/settings', {
  method: 'POST',
  body:   JSON.stringify( { title: 'New Site Title' } ),
} );
```

React hook pattern:

```tsx
import { useWpFetch, getBazaarContext, wpJson } from '@bazaar/client';

function SettingsPanel(): React.JSX.Element {
  const { data: settings, loading, refetch } = useWpFetch<Record<string, unknown>>( '/wp/v2/settings' );
  const [ saving, setSaving ] = React.useState( false );

  async function save( key: string, value: string ): Promise<void> {
    setSaving( true );
    await wpJson( '/wp/v2/settings', {
      method: 'POST',
      body:   JSON.stringify( { [key]: value } ),
    } );
    setSaving( false );
    refetch();
  }

  if ( loading ) return <Spinner />;
  return (
    <form onSubmit={ e => { e.preventDefault(); save( 'title', 'New Title' ); } }>
      <input defaultValue={ settings?.title as string } />
      <button type="submit" disabled={ saving }>Save</button>
    </form>
  );
}
```

---

## Show a toast notification

The design system `useToast` hook renders ephemeral notifications inside your ware.

```tsx
// main.tsx — wrap the app once
import { ToastProvider } from '@bazaar/design';

ReactDOM.createRoot( ... ).render(
  <ErrorBoundary>
    <ToastProvider>
      <App />
    </ToastProvider>
  </ErrorBoundary>
);

// Any component — use the hook
import { useToast } from '@bazaar/design';

function SaveButton(): React.JSX.Element {
  const toast = useToast();

  async function handleSave(): Promise<void> {
    try {
      await save();
      toast.success( 'Saved!' );
    } catch {
      toast.error( 'Save failed — try again.' );
    }
  }

  return <button onClick={ handleSave }>Save</button>;
}
```

To show a toast in the **shell chrome** (visible even when the user navigates away):

```ts
import { bzr } from '@bazaar/client';
bzr.toast( 'Export complete!', 'success' );
bzr.toast( 'API unreachable', 'error' );
bzr.toast( 'Syncing…', 'info', 8000 ); // custom duration in ms
```

---

## Persist data with the Bazaar store (server-backed)

`createStore` uses the Bazaar REST storage API (`/bazaar/v1/store/{slug}`). Data is saved in `wp_usermeta` — it survives browser storage clears and is per-user and per-ware.

```ts
import { createStore, getBazaarContext } from '@bazaar/client';

// Create once, reuse the instance
const ctx   = getBazaarContext();
const store = createStore( ctx.slug, ctx );

// Write
await store.set( 'lastTab', 'settings' );

// Read (returns undefined if key doesn't exist)
const tab = await store.get<string>( 'lastTab' ); // → 'settings' | undefined

// Delete one key
await store.del( 'lastTab' );

// List all keys for this ware
const keys = await store.keys(); // → ['lastTab', 'theme', …]

// Wipe everything for this ware (for this user)
await store.clear();
```

---

## Persist data locally (localStorage)

Use `createWaredStore` for storage that tries the Bazaar server store first and falls back to `localStorage` when offline or unauthenticated. Ideal for wares that need data to survive browser cache clears.

```ts
import { createWaredStore } from '@bazaar/client';

interface AppState {
  theme:       'light' | 'dark';
  sidebarOpen: boolean;
}

const DEFAULT: AppState = { theme: 'light', sidebarOpen: true };

// lsPrefix must follow the bazaar-{slug}-* convention
const store = createWaredStore( {
  slug:     'my-ware',
  lsPrefix: 'bazaar-my-ware-',
} );

// Read (returns undefined if not stored yet)
const saved = await store.load<AppState>( 'ui' );
const state = saved ?? DEFAULT;

// Write
await store.save( 'ui', { ...state, theme: 'dark' } );
```

If you need raw `localStorage` for a custom shape:

```ts
// Key pattern: bazaar-{ware-slug}-v{n}
const KEY = 'bazaar-my-ware-v1';

function loadState<T>( fallback: T ): T {
  try {
    const raw = localStorage.getItem( KEY );
    return raw ? ( JSON.parse( raw ) as T ) : fallback;
  } catch {
    return fallback;
  }
}

function saveState<T>( state: T ): void {
  try {
    localStorage.setItem( KEY, JSON.stringify( state ) );
  } catch {
    // Storage full or unavailable — fail silently.
  }
}
```

---

## Call a custom REST endpoint

Register your endpoint in a companion PHP plugin (`wp bazaar scaffold endpoint MyEndpoint`). Then call it from your ware:

```ts
import { wpJson, WpApiError } from '@bazaar/client';

// GET with query params
const results = await wpJson<{ items: Item[] }>(
  '/bazaar/v1/my-ware/items?status=active&per_page=50',
);

// POST with a JSON body
const created = await wpJson<Item>( '/bazaar/v1/my-ware/items', {
  method: 'POST',
  body:   JSON.stringify( { name: 'New item', status: 'active' } ),
} );

// Handle errors
try {
  await wpJson( '/bazaar/v1/my-ware/items/999' );
} catch ( err ) {
  if ( err instanceof WpApiError && err.status === 404 ) {
    // Item not found
  }
}
```

React hook pattern for any endpoint:

```tsx
import { useWpFetch } from '@bazaar/client/react';

function ItemList(): React.JSX.Element {
  const { data, loading, error, refetch } =
    useWpFetch<{ items: Item[] }>( '/bazaar/v1/my-ware/items?status=active' );

  if ( loading ) return <Spinner />;
  if ( error )   return <p role="alert">{ error.message }</p>;

  return <ul>{ data?.items.map( item => <li key={ item.id }>{ item.name }</li> ) }</ul>;
}
```

---

## Navigate to another ware

```ts
import { bzr } from '@bazaar/client';

// Navigate the shell to a different ware
bzr.navigate( 'ledger' );

// Navigate to a specific route inside another ware
bzr.navigate( 'ledger', '/invoices/new?contact=42' );
```

---

## Emit and receive inter-ware events

Useful for coordinating two wares — e.g. Board selects a card, Ledger responds.

```ts
import { bzr } from '@bazaar/client';

// Ware A — emit
bzr.emit( 'contact:selected', { id: 42, name: 'Acme Corp' } );

// Ware B — subscribe (call this once, e.g. in useEffect)
const unsub = bzr.on( 'contact:selected', ( data ) => {
  const { id, name } = data as { id: number; name: string };
  console.log( 'Selected contact:', id, name );
} );

// Later: clean up
unsub();
```

React pattern with cleanup:

```tsx
useEffect( () => {
  const unsub = bzr.on( 'contact:selected', ( raw ) => {
    const contact = raw as Contact;
    setSelectedContact( contact );
  } );
  return unsub;
}, [] );
```

---

## Update the shell nav badge

Display a numeric badge on your ware's sidebar nav item — useful for unread counts, pending actions, etc.

```ts
import { bzr } from '@bazaar/client';

bzr.badge( 5 );  // show "5"
bzr.badge( 0 );  // clear the badge
```

---

## Trigger a background job from the UI

Declare the job in `manifest.json`, then let users trigger it manually:

```json
{
  "jobs": [
    {
      "id":       "sync_orders",
      "label":    "Sync orders from payment provider",
      "interval": "hourly"
    }
  ]
}
```

```ts
import { createJobs, getBazaarContext } from '@bazaar/client';

const ctx  = getBazaarContext();
const jobs = createJobs( ctx.slug, ctx );

// List scheduled jobs
const list = await jobs.list();
// → [{ id: 'sync_orders', label: 'Sync orders…', interval: 'hourly', next_run: '2025-01-15T14:00:00Z' }]

// Trigger immediately
await jobs.trigger( 'sync_orders' );
```

---

## Ware settings backed by manifest config schema

Declare a settings schema in `manifest.json`:

```json
{
  "settings": [
    { "key": "api_key",  "type": "string",  "label": "API Key",         "required": true },
    { "key": "max_rows", "type": "integer", "label": "Max rows to sync", "default": 100   }
  ]
}
```

Then use `createConfig` to read and write those settings:

```ts
import { createConfig, getBazaarContext } from '@bazaar/client';

const ctx    = getBazaarContext();
const config = createConfig( ctx.slug, ctx );

// Read (returns the stored value or the schema default)
const apiKey  = await config.get<string>( 'api_key' );
const maxRows = await config.get<number>( 'max_rows' ); // → 100 if not set

// Write
await config.set( 'api_key', 'sk_live_abc123' );

// List all config entries with metadata
const all = await config.list();
```

Admins can also manage these settings via `wp bazaar config get <slug> <key>` and `wp bazaar config set <slug> <key> <value>`.

---

## Upload a file to WordPress media library

```ts
import { wpFetch, getBazaarContext } from '@bazaar/client';

async function uploadFile( file: File ): Promise<number> {
  const ctx      = getBazaarContext();
  const formData = new FormData();
  formData.append( 'file', file );
  formData.append( 'title', file.name );

  const response = await wpFetch( '/wp/v2/media', {
    method:  'POST',
    headers: { 'X-WP-Nonce': ctx.nonce, 'Content-Disposition': `attachment; filename="${ file.name }"` },
    body:    formData,
  } );

  if ( ! response.ok ) {
    throw new Error( `Upload failed: ${ response.status }` );
  }

  const media = await response.json() as { id: number };
  return media.id;
}
```

> Requires `"permissions": ["write:media"]` in `manifest.json`.

---

## Use the design system toast with context

Pattern for a toast helper module so any component can call `toast.success()` without prop drilling:

```tsx
// src/toast.ts
import { useToast } from '@bazaar/design';
export { useToast };

// src/components/DeleteButton.tsx
import { useToast } from '../toast';
import { wpJson }   from '@bazaar/client';

interface Props { itemId: number; onDeleted: () => void; }

export default function DeleteButton( { itemId, onDeleted }: Props ): React.JSX.Element {
  const toast                   = useToast();
  const [ busy, setBusy ] = React.useState( false );

  async function handleDelete(): Promise<void> {
    setBusy( true );
    try {
      await wpJson( `/bazaar/v1/my-ware/items/${ itemId }`, { method: 'DELETE' } );
      toast.success( 'Deleted.' );
      onDeleted();
    } catch {
      toast.error( 'Could not delete — try again.' );
    } finally {
      setBusy( false );
    }
  }

  return (
    <button onClick={ handleDelete } disabled={ busy } aria-label="Delete item">
      { busy ? <Spinner /> : 'Delete' }
    </button>
  );
}
```

---

## Handle REST errors gracefully

```tsx
import { wpJson, WpApiError } from '@bazaar/client';

async function fetchItem( id: number ): Promise<Item | null> {
  try {
    return await wpJson<Item>( `/bazaar/v1/my-ware/items/${ id }` );
  } catch ( err ) {
    if ( err instanceof WpApiError ) {
      if ( err.status === 404 ) return null;          // not found — expected
      if ( err.status === 403 ) throw err;            // auth error — re-throw
      console.error( 'API error', err.status, err.message );
    }
    return null;
  }
}
```

---

## Deep-link routing with the shell

The shell can send a route to your ware (e.g. when the user bookmarks a URL or another ware calls `bzr.navigate`). Wire it up in your router:

```tsx
// With React Router v6
import { useNavigate } from 'react-router-dom';
import { onShellRoute } from '@bazaar/client';

function RouterSync(): null {
  const navigate = useNavigate();

  useEffect( () => {
    const unsub = onShellRoute( ( route ) => navigate( route ) );
    return unsub;
  }, [ navigate ] );

  return null;
}

// Render inside your <Router>
function App(): React.JSX.Element {
  return (
    <Router>
      <RouterSync />
      <Routes>
        <Route path="/" element={ <Home /> } />
        <Route path="/items/:id" element={ <ItemDetail /> } />
      </Routes>
    </Router>
  );
}
```
