import { test, expect } from '@playwright/test';
import { loginAsAdmin, goBazaar } from './helpers.ts';

test.describe( 'Flow ware', () => {
	test.beforeEach( async ( { page } ) => {
		await loginAsAdmin( page );
	} );

	test( 'Bazaar shell loads for flow ware', async ( { page } ) => {
		const errors: string[] = [];
		page.on( 'pageerror', e => errors.push( e.message ) );
		await goBazaar( page );
		expect( errors.filter( e => ! e.includes( 'ResizeObserver' ) ) ).toHaveLength( 0 );
	} );

	test( 'Flow ware page returns 200', async ( { page } ) => {
		const response = await page.goto( '/wp-admin/admin.php?page=bazaar' );
		expect( response?.status() ).toBeLessThan( 400 );
	} );

	test( 'Flow ware URL with ware param is reachable', async ( { page } ) => {
		const response = await page.goto( '/wp-admin/admin.php?page=bazaar&ware=flow' );
		expect( response?.status() ).toBeLessThan( 400 );
	} );
} );
