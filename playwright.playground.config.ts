/**
 * Playwright config for live Playground QA testing.
 * Run: npx playwright test --config=playwright.playground.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig( {
	testDir:  './tests/e2e',
	testMatch: '{playground-qa,icon-verify,icon-diagnose,ware-data-check,network-trace,svg-render-test}.ts',
	timeout:  600_000, // 10 min — Playground takes 3-4 min to boot
	retries:  0,
	workers:  1,
	reporter: 'list',

	use: {
		headless:   false,  // Playground needs headed mode for SharedArrayBuffer / COOP
		screenshot: 'on',
		video:      'retain-on-failure',
		viewport:   { width: 1400, height: 900 },
		// No baseURL — tests navigate to the full Playground URL
		// No storageState — no pre-existing auth needed
	},

	projects: [
		{
			name: 'chromium',
			use:  { ...devices[ 'Desktop Chrome' ], headless: false },
		},
	],
} );
