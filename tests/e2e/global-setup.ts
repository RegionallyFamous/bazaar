import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL    = 'http://localhost:8888';
const STATE_FILE  = path.resolve( __dirname, '.auth-state.json' );
const ADMIN_USER  = 'admin';
const ADMIN_PASS  = 'password';

/**
 * Runs once before all test workers start.
 * Logs in to WordPress and saves the browser storage state (cookies + localStorage)
 * so every test can reuse the session without re-authenticating.
 *
 * Retries the full login sequence up to 3 times in case wp-env is still
 * warming up when the first attempt lands (common in CI).
 */
export default async function globalSetup() {
	const browser = await chromium.launch();
	const page    = await browser.newPage();

	const MAX_ATTEMPTS = 3;
	let lastError: unknown;

	for ( let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++ ) {
		try {
			// Navigate and wait for the login form to be interactive.
			await page.goto( `${ BASE_URL }/wp-login.php`, { waitUntil: 'networkidle', timeout: 60_000 } );
			await page.fill( '#user_login', ADMIN_USER );
			await page.fill( '#user_pass',  ADMIN_PASS );
			await page.click( '#wp-submit' );
			await page.waitForURL( /wp-admin/, { timeout: 60_000 } );

			// Persist auth cookies so worker pages don't need to login.
			fs.mkdirSync( path.dirname( STATE_FILE ), { recursive: true } );
			await page.context().storageState( { path: STATE_FILE } );
			await browser.close();
			return;
		} catch ( err ) {
			lastError = err;
			if ( attempt < MAX_ATTEMPTS ) {
				// Brief back-off before retrying — gives wp-env time to finish booting.
				await new Promise( ( r ) => setTimeout( r, 5_000 * attempt ) );
			}
		}
	}

	await browser.close();
	throw lastError;
}
