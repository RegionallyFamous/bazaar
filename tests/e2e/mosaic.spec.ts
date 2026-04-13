import { test, expect } from '@playwright/test';
import { loginAsAdmin, goBazaar } from './helpers.ts';

test.describe( 'Mosaic ware', () => {
	test.beforeEach( async ( { page } ) => {
		await loginAsAdmin( page );
	} );

	test( 'Bazaar shell loads without JS errors', async ( { page } ) => {
		const errors: string[] = [];
		page.on( 'pageerror', e => errors.push( e.message ) );
		await goBazaar( page );
		expect( errors.filter( e => ! e.includes( 'ResizeObserver' ) ) ).toHaveLength( 0 );
	} );

	test( 'Mosaic ware URL is reachable', async ( { page } ) => {
		const response = await page.goto( '/wp-admin/admin.php?page=bazaar&ware=mosaic' );
		expect( response?.status() ).toBeLessThan( 400 );
	} );
} );
