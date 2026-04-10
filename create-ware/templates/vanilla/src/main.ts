import { getBazaarContext, setBazaarContext, wpJson } from '@bazaar/client';
import type { WpPost, WpUser } from '@bazaar/client';

// Dev mode: seed context from Vite env vars when not running inside WordPress.
if ( import.meta.env.DEV ) {
  setBazaarContext( {
    nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
    restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
    slug:    import.meta.env.VITE_BAZAAR_SLUG ?? '__WARE_SLUG__',
  } );
}

const ctx = getBazaarContext();
const app = document.getElementById( 'app' )!;

app.innerHTML = `
  <div class="app">
    <header class="app-header">
      <h1>__WARE_NAME__</h1>
      <span id="user-greeting"></span>
    </header>
    <main class="app-main">
      <p id="status" class="status">Loading…</p>
      <ul id="post-list" class="post-list" hidden></ul>
    </main>
  </div>
`;

const userEl   = document.getElementById( 'user-greeting' )!;
const statusEl = document.getElementById( 'status' )!;
const listEl   = document.getElementById( 'post-list' )!;

async function init() {
  try {
    const [ user, posts ] = await Promise.all( [
      wpJson<WpUser>( '/wp/v2/users/me' ),
      wpJson<WpPost[]>( '/wp/v2/posts?per_page=5&status=publish' ),
    ] );

    userEl.textContent = `Hello, ${ user.name }`;

    if ( posts.length === 0 ) {
      statusEl.textContent = 'No posts found.';
    } else {
      statusEl.hidden = true;
      listEl.hidden   = false;
      for ( const post of posts ) {
        const li = document.createElement( 'li' );
        li.innerHTML = post.title.rendered;
        listEl.appendChild( li );
      }
    }
  } catch ( err ) {
    statusEl.textContent = err instanceof Error ? err.message : 'An error occurred.';
    statusEl.classList.add( 'error' );
  }
}

void init();

if ( 'serviceWorker' in navigator && ! import.meta.env.DEV ) {
  window.addEventListener( 'load', () => {
    navigator.serviceWorker.register( './sw.js' ).catch( () => {} );
  } );
}

// Expose context on window for debugging — useful during development.
if ( import.meta.env.DEV ) {
  ( window as unknown as Record<string, unknown> )._bazaar = ctx;
}
