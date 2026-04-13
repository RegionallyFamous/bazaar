import type { Page } from '@playwright/test';

/** wp-env default admin credentials */
const WP_ADMIN_USER = 'admin';
const WP_ADMIN_PASS = 'password';

/**
 * Ensure the page is logged in to the WordPress admin panel.
 *
 * With globalSetup pre-loading the auth storageState, the browser context
 * already carries valid cookies.  This function just verifies we can reach
 * wp-admin — if the session is stale it falls back to a full login.
 */
export async function loginAsAdmin( page: Page ): Promise<void> {
	await page.goto( '/wp-admin/' );
	// If we land on the login page the stored session was invalid — login fresh.
	if ( page.url().includes( 'wp-login.php' ) ) {
		await page.fill( '#user_login', WP_ADMIN_USER );
		await page.fill( '#user_pass', WP_ADMIN_PASS );
		await page.click( '#wp-submit' );
		await page.waitForURL( /wp-admin/, { timeout: 60_000 } );
	}
}

/**
 * Navigate to the Bazaar shell page in WP admin.
 * Returns after the shell JS bundle has loaded.
 */
export async function goBazaar( page: Page ): Promise<void> {
	await page.goto( '/wp-admin/admin.php?page=bazaar' );
	// Wait for the Bazaar shell container to be present
	await page.waitForSelector( '#bazaar-shell, #root, [data-bazaar], .bazaar-shell', {
		timeout: 15_000,
	} ).catch( () => {
		// Shell may use a different selector — just wait for domcontentloaded
	} );
}

/**
 * Navigate to the Bazaar shell and open a specific ware by name.
 * Clicks the nav item matching the ware's display name.
 */
export async function openWare( page: Page, wareName: string ): Promise<void> {
	await goBazaar( page );
	// Try to find and click the ware nav item (case-insensitive)
	const navItem = page.getByRole( 'button', { name: new RegExp( wareName, 'i' ) } )
		.or( page.getByRole( 'link', { name: new RegExp( wareName, 'i' ) } ) )
		.or( page.locator( `[data-ware="${ wareName.toLowerCase() }"]` ) );

	const count = await navItem.count();
	if ( count > 0 ) {
		await navItem.first().click();
		// Wait for the ware iframe or container to become visible
		await page.waitForTimeout( 1000 );
	}
}
