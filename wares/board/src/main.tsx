import { StrictMode }       from 'react';
import { createRoot }       from 'react-dom/client';
import { getBazaarContext } from '@bazaar/client';
import { applyAdminColor }  from '@bazaar/design/theme';
import '@bazaar/design/css';
import App                  from './App.tsx';

applyAdminColor( getBazaarContext().adminColor );

const root = document.getElementById( 'root' );
if ( root ) createRoot( root ).render( <StrictMode><App /></StrictMode> );
