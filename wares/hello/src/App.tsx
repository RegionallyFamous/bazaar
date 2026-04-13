/**
 * App.tsx — the root component of the Hello reference ware.
 *
 * This file demonstrates the core @bazaar/client patterns every ware needs:
 *   - useCurrentUser()   — who is logged in?
 *   - useWpPosts()       — read WordPress content
 *   - bzr.toast()        — send a notification to the shell chrome
 *   - CSS design tokens  — colour, spacing, typography from --bw-* vars
 *
 * Keep reading the comments — every decision is explained inline.
 */

import { bzr }                      from '@bazaar/client';
import { useCurrentUser, useWpPosts } from '@bazaar/client/react';
import { Button, Spinner }            from '@bazaar/design';
import type { WpPost }                from '@bazaar/client';
import './App.css';

// ─── Types ───────────────────────────────────────────────────────────────────

// No props on the root component — it owns its own data fetching.

// ─── Component ───────────────────────────────────────────────────────────────

export default function App(): React.JSX.Element {
  // useCurrentUser() fetches /wp/v2/users/me with the nonce that
  // @bazaar/client extracted from the iframe URL. No manual auth needed.
  const { user, loading: userLoading } = useCurrentUser();

  // useWpPosts() accepts the same query params as /wp/v2/posts.
  // no_found_rows equivalent: the hook does not paginate for you —
  // set per_page to what you actually need rather than fetching all.
  const { posts, loading: postsLoading, error: postsError } = useWpPosts( {
    per_page: 5,
    status:   'publish',
    orderby:  'date',
    order:    'desc',
  } );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="hello">
      <header className="hello__header">
        <h1 className="hello__title">Hello, { userLoading ? '…' : ( user?.name ?? 'stranger' ) }!</h1>
        <p className="hello__subtitle">This is the minimal Bazaar reference ware.</p>
      </header>

      <section className="hello__section" aria-labelledby="posts-heading">
        <h2 id="posts-heading" className="hello__section-title">Recent Posts</h2>

        { postsLoading && (
          // Use <Spinner> from @bazaar/design rather than rolling your own.
          <div className="hello__loading" aria-live="polite" aria-busy="true">
            <Spinner />
          </div>
        ) }

        { postsError && (
          // role="alert" makes screen readers announce errors immediately.
          <p role="alert" className="hello__error">
            Could not load posts: { postsError.message }
          </p>
        ) }

        { ! postsLoading && ! postsError && (
          <ul className="hello__posts">
            { posts.map( ( post: WpPost ) => (
              // Key must be a stable, unique identifier — never array index.
              <li key={ post.id } className="hello__post">
                {/*
                  post.title.rendered may contain HTML entities (e.g. &#8217;).
                  dangerouslySetInnerHTML is safe here because WordPress
                  sanitises post titles on save — but only use it for WP-sourced
                  content, never for arbitrary user input.
                */}
                <span dangerouslySetInnerHTML={ { __html: post.title.rendered } } />
              </li>
            ) ) }
            { posts.length === 0 && <li className="hello__empty">No published posts yet.</li> }
          </ul>
        ) }
      </section>

      <section className="hello__section" aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="hello__section-title">Shell Actions</h2>
        <div className="hello__actions">
          {/*
            bzr.toast() sends a notification to the Bazaar shell chrome —
            it appears outside the iframe so it's visible even if the user
            navigates to a different ware.
          */}
          <Button onClick={ () => bzr.toast( 'Hello from the Hello ware!', 'success' ) }>
            Shell toast
          </Button>

          {/*
            bzr.navigate() tells the shell to switch to a different ware.
            Comment this out if you only have this ware installed.
          */}
          <Button variant="secondary" onClick={ () => bzr.navigate( 'board' ) }>
            Go to Board
          </Button>
        </div>
      </section>
    </main>
  );
}
