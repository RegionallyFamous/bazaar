import type { Meta, StoryObj } from '@storybook/react';
import App from '../App';

const meta: Meta<typeof App> = {
  title:     'Ware/App',
  component: App,
  tags:      [ 'autodocs' ],
  parameters: {
    docs: {
      description: {
        component: 'Root component of the ware. Rendered inside a Bazaar iframe in production.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof App>;

export const Default: Story = {};

export const DarkBackground: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
