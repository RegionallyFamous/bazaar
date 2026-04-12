import { useCurrentUser, useWpPosts } from '@bazaar/client/react';
import { Spinner }                    from '@bazaar/design';
import './App.css';

export default function App() {
  const { user }          = useCurrentUser();
  const { posts, loading, error } = useWpPosts( { per_page: 5, status: 'publish' } );

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-header__title">__WARE_NAME__</h1>
        { user && <p className="app-header__greeting">Hello, { user.name }</p> }
      </header>

      <main className="app-main">
        { loading && (
          <div className="app-loading">
            <Spinner size="md" />
          </div>
        ) }
        { error && (
          <p className="app-error">{ error.message }</p>
        ) }
        { ! loading && ! error && (
          <ul className="post-list">
            { posts.map( post => (
              <li key={ post.id } className="post-list__item">
                <span dangerouslySetInnerHTML={ { __html: post.title.rendered } } />
              </li>
            ) ) }
            { posts.length === 0 && (
              <li className="post-list__empty">No posts found.</li>
            ) }
          </ul>
        ) }
      </main>
    </div>
  );
}
