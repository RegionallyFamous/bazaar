import type { Preview } from '@storybook/react';
import { setBazaarContext } from '@bazaar/client';

// Seed a mock Bazaar context so components work in Storybook without a WP install.
setBazaarContext( {
  nonce:      'storybook-nonce',
  restUrl:    'http://localhost:8888/wp-json',
  serveUrl:   'http://localhost:8888/wp-json/bazaar/v1/serve/my-ware',
  slug:       'my-ware',
  adminColor: 'fresh',
} );

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'wordpress',
      values: [
        { name: 'wordpress', value: '#f0f0f1' },
        { name: 'dark',      value: '#1d2327' },
        { name: 'white',     value: '#ffffff' },
      ],
    },
    actions:   { argTypesRegex: '^on[A-Z].*' },
    controls:  { matchers: { color: /(background|color)$/i, date: /Date$/ } },
    layout:    'fullscreen',
  },
};

export default preview;
