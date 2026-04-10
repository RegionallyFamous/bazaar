import { useCurrentUser, useWpPosts } from '@bazaar/client/react';
import './App.css';

export default function App() {
  const user              = useCurrentUser();
  const { posts, loading, error } = useWpPosts( { per_page: 5, status: 'publish' } );

  return (
    <div className="app">
      <header className="app-header">
        <h1>__WARE_NAME__</h1>
        { user && <p className="user-greeting">Hello, { user.name }</p> }
      </header>

      <main className="app-main">
        { loading && <p className="status">Loading posts…</p> }
        { error   && <p className="status error">{ error.message }</p> }
        { ! loading && ! error && (
          <ul className="post-list">
            { posts.map( post => (
              <li key={ post.id }>
                <span dangerouslySetInnerHTML={ { __html: post.title.rendered } } />
              </li>
            ) ) }
            { posts.length === 0 && <li className="status">No posts found.</li> }
          </ul>
        ) }
      </main>
    </div>
  );
}
