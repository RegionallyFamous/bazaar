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
 */
export default async function globalSetup() {
	const browser = await chromium.launch();
	const page    = await browser.newPage();

	await page.goto( `${ BASE_URL }/wp-login.php` );
	await page.fill( '#user_login', ADMIN_USER );
	await page.fill( '#user_pass',  ADMIN_PASS );
	await page.click( '#wp-submit' );
	await page.waitForURL( /wp-admin/, { timeout: 60_000 } );

	// Persist auth cookies so worker pages don't need to login.
	fs.mkdirSync( path.dirname( STATE_FILE ), { recursive: true } );
	await page.context().storageState( { path: STATE_FILE } );
	await browser.close();
}
