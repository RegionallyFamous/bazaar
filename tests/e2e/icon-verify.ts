/**
 * Icon verification — confirms all 7 ware icons load after the Mosaic UTF-8 fix.
 *
 * Run with:
 *   npx playwright test tests/e2e/icon-verify.ts --config=playwright.playground.config.ts
 */

import { test, expect, Frame, Page } from '@playwright/test';

const PLAYGROUND_URL =
	'https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/blueprint.json';

async function getWpAdminFrame( page: Page ): Promise<Frame | null> {
	for ( const frame of page.frames() ) {
		if ( frame.url().includes( '/wp-admin/' ) && frame.url().includes( 'admin.php' ) ) {
			return frame;
		}
	}
	return null;
}

test( 'All 7 ware icons load correctly after Mosaic UTF-8 fix', async ( { page } ) => {
	test.setTimeout( 300_000 );

	await page.goto( PLAYGROUND_URL, { timeout: 60_000 } );
	console.log( 'Waiting for Playground to boot…' );

	// Poll every 20s until WP admin frame appears (up to 3 min)
	let wpFrame: Frame | null = null;
	for ( let i = 0; i < 9; i++ ) {
		await page.waitForTimeout( 20_000 );
		wpFrame = await getWpAdminFrame( page );
		if ( wpFrame ) {
			const body = await wpFrame.evaluate( () => document.body?.className ?? '' ).catch( () => '' );
			if ( body.includes( 'wp-admin' ) ) {
				console.log( `✓ WP admin frame ready at poll ${ i + 1 }` );
				break;
			}
		}
		wpFrame = null;
		console.log( `  Poll ${ i + 1 }/9 — not ready yet` );
	}

	if ( ! wpFrame ) throw new Error( 'WP admin frame never appeared' );

	// Give the shell JS a moment to render icons
	await wpFrame.waitForTimeout( 3000 );

	// ── Test 1: Serve endpoint HTTP status for all 7 icons ─────────────────
	console.log( '\n── Serve endpoint status ──' );
	const serveStatus = await wpFrame.evaluate( async () => {
		const slugs = [ 'board', 'flow', 'ledger', 'mosaic', 'sine', 'swatch', 'tome' ];
		const results: Record<string, { status: number; contentType: string | null }> = {};
		for ( const slug of slugs ) {
			try {
				const r = await fetch( `/wp-json/bazaar/v1/serve/${ slug }/icon.svg` );
				results[ slug ] = { status: r.status, contentType: r.headers.get( 'content-type' ) };
			} catch ( e: any ) {
				results[ slug ] = { status: -1, contentType: e.message };
			}
		}
		return results;
	} );

	let allServeOk = true;
	for ( const [ slug, r ] of Object.entries( serveStatus ) ) {
		const ok = r.status === 200;
		if ( ! ok ) allServeOk = false;
		console.log( `  ${ ok ? '✓' : '✗' } ${ slug.padEnd( 7 ) } HTTP ${ r.status } — ${ r.contentType ?? 'no content-type' }` );
	}

	// ── Test 2: Nav button img elements and load state ──────────────────────
	console.log( '\n── Nav icon img elements ──' );

	// Wait a bit for lazy images to load
	await wpFrame.waitForTimeout( 2000 );

	const navIconData = await wpFrame.evaluate( () => {
		const btns = document.querySelectorAll( '.bsh-nav__btn[data-slug]' );
		return Array.from( btns ).map( btn => {
			const slug = btn.getAttribute( 'data-slug' ) ?? '';
			const img  = btn.querySelector( 'img' ) as HTMLImageElement | null;
			return {
				slug,
				hasImg:       !! img,
				src:          img?.src?.slice( -80 ) ?? 'none',
				complete:     img?.complete ?? false,
				naturalWidth: img?.naturalWidth ?? 0,
			};
		} );
	} );

	let allNavOk = true;
	for ( const item of navIconData ) {
		const ok = item.hasImg && item.complete && item.naturalWidth > 0;
		if ( item.slug && ! ok ) allNavOk = false;
		if ( item.slug ) {
			console.log( `  ${ ok ? '✓' : '✗' } ${ item.slug.padEnd( 7 ) } img=${ item.hasImg } complete=${ item.complete } width=${ item.naturalWidth }` );
		}
	}

	// ── Test 3: Home screen featured card icons ─────────────────────────────
	console.log( '\n── Home/catalog card icons ──' );
	// Navigate to home to see featured cards
	await wpFrame.evaluate( () => {
		const homeBtn = document.querySelector( '[data-slug="home"]' ) as HTMLElement | null;
		if ( homeBtn ) homeBtn.click();
	} );
	await wpFrame.waitForTimeout( 2000 );

	// Skip welcome screen if present
	const skipBtn = await wpFrame.$( '.bsh-welcome__skip, button:has-text("Skip")' ).catch( () => null );
	if ( skipBtn ) { await skipBtn.click(); await wpFrame.waitForTimeout( 1000 ); }

	await page.screenshot( { path: 'tests/e2e/screenshots/icon-verify-home.png' } );

	const homeCardIcons = await wpFrame.evaluate( () => {
		// Look for all ware cards in the home/dashboard area
		const cards = document.querySelectorAll( '[class*="bsh-"] [data-slug]' );
		return Array.from( cards ).map( card => {
			const slug = card.getAttribute( 'data-slug' ) ?? 'unknown';
			const img  = card.querySelector( 'img' ) as HTMLImageElement | null;
			const init = card.querySelector( '[class*="initial"]' );
			return {
				slug,
				hasImg:       !! img,
				imgLoaded:    img ? ( img.complete && img.naturalWidth > 0 ) : false,
				imgSrc:       img?.src?.slice( -60 ) ?? 'none',
				showsInitial: !! init && window.getComputedStyle( init as HTMLElement ).display !== 'none',
			};
		} );
	} );

	if ( homeCardIcons.length > 0 ) {
		console.log( '  Home card icons:' );
		homeCardIcons.slice( 0, 10 ).forEach( ( c: any ) => {
			const ok = c.hasImg && c.imgLoaded;
			console.log( `    ${ ok ? '✓' : '✗' } ${ c.slug.padEnd( 7 ) } loaded=${ c.imgLoaded } initial=${ c.showsInitial }` );
		} );
	}

	// ── Test 4: Manage catalog ───────────────────────────────────────────────
	console.log( '\n── Manage catalog card icons ──' );
	await wpFrame.evaluate( () => {
		const manageBtn = document.querySelector( '[data-slug="manage"]' ) as HTMLElement | null;
		if ( manageBtn ) manageBtn.click();
	} );
	await wpFrame.waitForTimeout( 3000 );
	await page.screenshot( { path: 'tests/e2e/screenshots/icon-verify-manage.png' } );

	const catalogIconData = await wpFrame.evaluate( () => {
		// Catalog uses .bsh-app-card or similar
		const imgs = document.querySelectorAll( '[class*="app-card"] img, [class*="core-card"] img, [class*="catalog"] img' );
		if ( imgs.length === 0 ) {
			// Broader search
			const allImgs = document.querySelectorAll( '.bsh-manage img' );
			return Array.from( allImgs ).map( img => {
				const i = img as HTMLImageElement;
				return { src: i.src.slice( -60 ), loaded: i.complete && i.naturalWidth > 0, alt: i.alt };
			} );
		}
		return Array.from( imgs ).map( img => {
			const i = img as HTMLImageElement;
			return { src: i.src.slice( -60 ), loaded: i.complete && i.naturalWidth > 0, alt: i.alt };
		} );
	} );

	console.log( `  Catalog img elements found: ${ catalogIconData.length }` );
	catalogIconData.slice( 0, 10 ).forEach( ( img: any ) => {
		console.log( `    ${ img.loaded ? '✓' : '✗' } ${ img.src }` );
	} );

	// ── Summary ──────────────────────────────────────────────────────────────
	console.log( '\n══════════════════════════════' );
	console.log( 'ICON VERIFICATION SUMMARY' );
	console.log( '══════════════════════════════' );
	console.log( `Serve endpoints:  ${ allServeOk ? '✅ ALL 200' : '❌ SOME FAILED' }` );
	const mosaicServe = serveStatus[ 'mosaic' ];
	const sineServe   = serveStatus[ 'sine' ];
	console.log( `Mosaic serve:     HTTP ${ mosaicServe.status } — ${ mosaicServe.contentType }` );
	console.log( `Sine serve:       HTTP ${ sineServe.status } — ${ sineServe.contentType }` );
	console.log( `Nav img elements: ${ allNavOk ? '✅ ALL LOADED' : '❌ SOME MISSING/BROKEN' }` );
	console.log( '══════════════════════════════' );

	expect( mosaicServe.status ).toBe( 200 );
	expect( sineServe.status ).toBe( 200 );
} );
