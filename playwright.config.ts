import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Tests run against a real WordPress site started by @wordpress/env (wp-env).
 * Start the environment before running:
 *   npx wp-env start
 * Then run tests:
 *   npx playwright test
 *
 * wp-env exposes:
 *   - WordPress frontend: http://localhost:8888
 *   - WordPress admin:    http://localhost:8888/wp-admin
 */
export default defineConfig( {
	testDir: './tests/e2e',
	timeout: 30_000,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? 'github' : 'list',

	use: {
		baseURL:     'http://localhost:8888',
		channel:     'chromium',
		headless:    true,
		screenshot:  'only-on-failure',
		video:       'retain-on-failure',
	},

	projects: [
		{
			name:  'chromium',
			use:   { ...devices[ 'Desktop Chrome' ] },
		},
	],
} );
