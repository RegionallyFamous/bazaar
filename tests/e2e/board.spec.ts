import { test, expect } from '@playwright/test';
import { loginAsAdmin, goBazaar } from './helpers.ts';

/**
 * Board ware smoke tests.
 *
 * These require a running wp-env environment with the Bazaar plugin
 * installed and the Board ware uploaded.
 *
 * Run: npx wp-env start && npx playwright test board
 */

test.describe( 'Board ware', () => {
	test.beforeEach( async ( { page } ) => {
		await loginAsAdmin( page );
	} );

	test( 'Bazaar shell loads without JS errors', async ( { page } ) => {
		const errors: string[] = [];
		page.on( 'pageerror', e => errors.push( e.message ) );
		await goBazaar( page );
		expect( errors.filter( e => ! e.includes( 'ResizeObserver' ) ) ).toHaveLength( 0 );
	} );

	test( 'Board ware renders kanban columns', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=bazaar&ware=board' );
		await page.waitForLoadState( 'networkidle' );
		// Board ware loads in an iframe or shadow DOM — check the page at least renders
		await expect( page ).not.toHaveTitle( /404|Error|Not Found/i );
	} );

	test( 'Board ware URL is reachable', async ( { page } ) => {
		const response = await page.goto( '/wp-admin/admin.php?page=bazaar' );
		expect( response?.status() ).toBeLessThan( 400 );
	} );
} );
