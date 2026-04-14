import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers.ts';

test.describe( 'Ware icons render', () => {
	test.beforeEach( async ( { page } ) => {
		await loginAsAdmin( page );
	} );

	test( 'all core app catalog icons render without error', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=bazaar' );
		// Wait for the catalog grid to finish loading
		await page.waitForSelector( '.bazaar-core-card__icon', { timeout: 20_000 } );
		// Give lazy-loaded images a moment to settle
		await page.waitForTimeout( 2_000 );

		const icons = page.locator( '.bazaar-core-card__icon' );
		const count = await icons.count();
		expect( count ).toBeGreaterThan( 0 );

		for ( let i = 0; i < count; i++ ) {
			const naturalWidth = await icons.nth( i ).evaluate(
				( img: HTMLImageElement ) => img.naturalWidth
			);
			const slug = await icons.nth( i )
				.locator( 'xpath=ancestor::*[@data-slug][1]' )
				.getAttribute( 'data-slug' )
				.catch( () => `index-${ i }` );
			expect( naturalWidth, `icon for "${ slug }" did not render` ).toBeGreaterThan( 0 );
		}
	} );

	test( 'installed ware gallery icons render without error', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=bazaar' );
		await page.waitForTimeout( 2_000 );

		const icons = page.locator( '.bazaar-card__icon' );
		const count = await icons.count();
		if ( count === 0 ) {
			test.skip();
		}
		for ( let i = 0; i < count; i++ ) {
			const naturalWidth = await icons.nth( i ).evaluate(
				( img: HTMLImageElement ) => img.naturalWidth
			);
			expect( naturalWidth, `gallery icon ${ i } did not render` ).toBeGreaterThan( 0 );
		}
	} );
} );
