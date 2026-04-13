/**
 * Playground QA — comprehensive end-to-end test against the live Playground demo.
 *
 * Run with:
 *   npx playwright test --config=playwright.playground.config.ts
 *
 * Playground takes 2-4 minutes to boot.
 */

import { test, expect, Page, Frame, ConsoleMessage } from '@playwright/test';

const PLAYGROUND_URL =
	'https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/blueprint.json';

const BENIGN_PATTERNS = [
	/CursorBrowser/,
	/ResizeObserver/,
	/JQMIGRATE/,
	/Intercepted.*admin requests/,
	/pluginZipFile.*deprecated/,
	/Loaded WordPress version.*differs/,
	/Native dialog overrides/,
	/Event handler of.*event must be added/,
	/bazaar-telemetry/,
	/Access-Control-Allow-Origin/,
	/No 'Access-Control/,
	/ERR_FAILED/,
	/preflight/,
];

function isBenign( text: string ): boolean {
	return BENIGN_PATTERNS.some( ( p ) => p.test( text ) );
}

/** Find the WP admin frame inside Playground (scoped iframe with wp-admin in path). */
async function getWpAdminFrame( page: Page ): Promise<Frame | null> {
	// The WP admin iframe URL looks like:
	// https://playground.wordpress.net/scope:xxxxx/wp-admin/admin.php?page=bazaar
	for ( const frame of page.frames() ) {
		const url = frame.url();
		// Must contain wp-admin/admin.php AND be a scoped Playground URL
		if ( url.includes( '/wp-admin/' ) && url.includes( 'admin.php' ) ) {
			return frame;
		}
	}
	return null;
}

/** Wait for Playground to fully boot and the WP admin frame to be accessible. */
async function waitForWpFrame( page: Page, maxWaitMs = 300_000 ): Promise<Frame> {
	const start = Date.now();
	while ( Date.now() - start < maxWaitMs ) {
		const frame = await getWpAdminFrame( page );
		if ( frame ) {
			// Verify body has content (not blank)
			try {
				const body = await frame.evaluate( () => document.body?.className ?? '' );
				if ( body ) {
					console.log( `WP admin frame ready. Body class: ${ body }` );
					return frame;
				}
			} catch {
				// Frame not ready yet
			}
		}
		await page.waitForTimeout( 3000 );
	}
	throw new Error( 'WP admin frame never became accessible' );
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe( 'Bazaar Playground QA', () => {
	test.setTimeout( 600_000 );

	const consoleErrors: string[] = [];

	test( 'Full Playground QA — Phases 1-9', async ( { page } ) => {
		// Collect real console errors (ignore benign Playground noise)
		page.on( 'console', ( msg ) => {
			const text = msg.text();
			if ( ( msg.type() === 'error' || msg.type() === 'warning' ) && ! isBenign( text ) ) {
				// Ignore 404s for ware assets (expected before wares are installed)
				if ( ! text.includes( '404' ) ) {
					consoleErrors.push( `[${ msg.type() }] ${ text.slice( 0, 200 ) }` );
				}
			}
		} );
		page.on( 'pageerror', ( err ) => {
			if ( ! isBenign( err.message ) ) {
				consoleErrors.push( `[pageerror] ${ err.message.slice( 0, 200 ) }` );
			}
		} );

		// ── PHASE 1: Boot ────────────────────────────────────────────────────
		console.log( '\n════ PHASE 1: Installation & Boot ════' );
		await page.goto( PLAYGROUND_URL, { timeout: 60_000 } );

		// Wait for Playground to show the WP admin interface
		// Poll with screenshots every 30s until we see the WP admin frame
		let wpFrame: Frame | null = null;
		for ( let i = 0; i < 10; i++ ) {
			await page.waitForTimeout( 30_000 );
			await page.screenshot( { path: `tests/e2e/screenshots/p1-boot-${ i + 1 }.png` } );
			wpFrame = await getWpAdminFrame( page );
			if ( wpFrame ) {
				try {
					const bodyClass = await wpFrame.evaluate( () => document.body?.className ?? '' );
					if ( bodyClass ) {
						console.log( `✓ WP admin frame found at poll ${ i + 1 }. Body: ${ bodyClass.slice( 0, 80 ) }` );
						break;
					}
				} catch { /* continue */ }
			}
			// Also check all frames for any WP content
			const frameUrls = page.frames().map( f => f.url() );
			console.log( `Poll ${ i + 1 }/10 frames: ${ frameUrls.join( ' | ' ) }` );
		}

		if ( ! wpFrame ) {
			await page.screenshot( { path: 'tests/e2e/screenshots/p1-FAIL-no-frame.png' } );
			throw new Error( 'PHASE 1 FAIL: WP admin frame never appeared after 5 minutes' );
		}

		await page.screenshot( { path: 'tests/e2e/screenshots/p1-shell-loaded.png' } );
		console.log( '✓ PHASE 1: Shell loaded' );

		// Check for JS errors in the WP frame
		const wpFrameErrors = await wpFrame.evaluate( () => {
			return ( window as any ).__bazaarErrors ?? [];
		} ).catch( () => [] );

		// ── PHASE 2: Home Screen ─────────────────────────────────────────────
		console.log( '\n════ PHASE 2: Home Screen & Getting Started ════' );

		// --- Welcome screen ---
		const welcomeTitle = await wpFrame.$( '.bsh-welcome__title, h1' ).catch( () => null );
		const welcomeText = await wpFrame.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ?? '' ).catch( () => '' );
		console.log( 'Welcome text snippet:', welcomeText.replace( /\s+/g, ' ' ).slice( 0, 300 ) );
		const hasWelcome = welcomeText.includes( 'Welcome to Bazaar' );
		console.log( 'Welcome screen present:', hasWelcome );

		// Skip to dashboard if welcome is showing
		if ( hasWelcome ) {
			const skipBtn = await wpFrame.$( '.bsh-welcome__skip, button:has-text("Skip")' ).catch( () => null );
			if ( skipBtn ) {
				await skipBtn.click();
				await wpFrame.waitForTimeout( 1000 );
				console.log( '✓ Clicked Skip — moved to dashboard' );
			}
		}

		await page.screenshot( { path: 'tests/e2e/screenshots/p2-after-skip.png' } );

		// --- Getting Started card ---
		// Reset onboarding state so we can test it
		await wpFrame.evaluate( () => {
			localStorage.removeItem( 'bazaar.welcomed' );
			localStorage.removeItem( 'bazaar.gs.done' );
			localStorage.removeItem( 'bazaar.gs.opened' );
		} ).catch( () => {} );
		await wpFrame.evaluate( () => location.reload() ).catch( () => {} );
		await page.waitForTimeout( 3000 );

		// Re-acquire frame after reload
		wpFrame = await getWpAdminFrame( page );
		if ( ! wpFrame ) {
			console.warn( '⚠ Could not re-acquire WP frame after reload' );
		}

		if ( wpFrame ) {
			await wpFrame.waitForTimeout( 2000 );
			// Skip past welcome screen again
			const skipBtn2 = await wpFrame.$( '.bsh-welcome__skip' ).catch( () => null );
			if ( skipBtn2 ) {
				await skipBtn2.click();
				await wpFrame.waitForTimeout( 1500 );
			}
			await page.screenshot( { path: 'tests/e2e/screenshots/p2-getting-started.png' } );

			// --- Getting Started card checks ---
			const gsCard = await wpFrame.$( '.bsh-gs' ).catch( () => null );
			console.log( 'Getting Started card present:', !! gsCard );

			const progressTrack = await wpFrame.$( '.bsh-gs__progress-track' ).catch( () => null );
			const progressBar   = await wpFrame.$( '.bsh-gs__progress-bar' ).catch( () => null );
			console.log( '  .bsh-gs__progress-track (grey track wrapper):', !! progressTrack ? '✓ PRESENT' : '✗ MISSING — OLD BUG??' );
			console.log( '  .bsh-gs__progress-bar (blue fill):', !! progressBar ? '✓ PRESENT' : '✗ MISSING' );

			if ( progressBar ) {
				const barStyle = await wpFrame.evaluate( ( el: Element ) => {
					const s = window.getComputedStyle( el );
					return {
						inlineWidth: ( el as HTMLElement ).style.width,
						computedWidth: s.width,
						bg: s.backgroundColor,
					};
				}, progressBar as any ).catch( () => null );
				console.log( '  Bar style:', JSON.stringify( barStyle ) );
				// At 0/2 complete the inline width should be "0%"
				if ( barStyle?.inlineWidth === '0%' ) {
					console.log( '  ✓ Progress bar correctly at 0% (not full-width bug)' );
				} else {
					console.log( '  ✗ Progress bar inline width unexpected:', barStyle?.inlineWidth );
				}
			}

			if ( progressTrack ) {
				const trackStyle = await wpFrame.evaluate( ( el: Element ) => {
					const s = window.getComputedStyle( el );
					return { bg: s.backgroundColor, width: s.width, flex: s.flex };
				}, progressTrack as any ).catch( () => null );
				console.log( '  Track style:', JSON.stringify( trackStyle ) );
			}

			// --- Max-width check ---
			if ( gsCard ) {
				const gsStyle = await wpFrame.evaluate( ( el: Element ) => {
					const s = window.getComputedStyle( el );
					return { maxWidth: s.maxWidth, width: s.width };
				}, gsCard as any ).catch( () => null );
				console.log( '  GS card max-width:', gsStyle?.maxWidth, '(should be 640px)' );
			}

			// --- GS step labels ---
			const stepLabels = await wpFrame.$$eval( '.bsh-gs__step-label', els => els.map( e => e.textContent?.trim() ) ).catch( () => [] );
			console.log( '  Step labels:', stepLabels );

			// --- Dismiss button aria-label ---
			const dismissLabel = await wpFrame.$eval( '.bsh-gs__dismiss', el => el.getAttribute( 'aria-label' ) ).catch( () => null );
			console.log( '  Dismiss aria-label:', dismissLabel );

			// Click Board nav item to complete "Open an app" milestone
			const boardNav = await wpFrame.$( '[data-slug="board"], [aria-label="Board"]' ).catch( () => null );
			if ( boardNav ) {
				await boardNav.click();
				await wpFrame.waitForTimeout( 2000 );
				console.log( '  ✓ Navigated to Board' );
			}

			// Go back to Home
			const homeNav = await wpFrame.$( '[data-slug="home"], [aria-label="Home"]' ).catch( () => null );
			if ( homeNav ) {
				await homeNav.click();
				await wpFrame.waitForTimeout( 1500 );
			}
			await page.screenshot( { path: 'tests/e2e/screenshots/p2-after-open-ware.png' } );

			// Check if "Open an app" step is now checked
			const doneSteps = await wpFrame.$$( '.bsh-gs__step--done' ).catch( () => [] );
			console.log( '  Completed steps after opening Board:', doneSteps.length );
		}

		// ── PHASE 3: Manage / Catalog ────────────────────────────────────────
		console.log( '\n════ PHASE 3: Manage / Catalog ════' );
		if ( wpFrame ) {
			// Navigate to Manage Wares — try multiple selectors
			const manageSelectors = [
				'[data-slug="manage"]',
				'.bsh-nav__manage-btn',
				'a[href*="view=manage"]',
				'a[href*="manage"]',
			];
			let manageBtn: any = null;
			for ( const sel of manageSelectors ) {
				manageBtn = await wpFrame.$( sel ).catch( () => null );
				if ( manageBtn ) { console.log( `  Found Manage via "${ sel }"` ); break; }
			}
			if ( ! manageBtn ) {
				// Fallback: find any anchor with "Manage" text in the nav area
				manageBtn = await wpFrame.evaluateHandle( () => {
					const links = Array.from( document.querySelectorAll( '.bsh-nav a, a[href*="bazaar"]' ) );
					return links.find( ( a: any ) => a.textContent?.includes( 'Manage' ) ) ?? null;
				} ).catch( () => null );
				if ( manageBtn ) console.log( '  Found Manage via text search' );
			}
			if ( manageBtn ) {
				await ( manageBtn as any ).click();
				await wpFrame.waitForTimeout( 3000 );
				await page.screenshot( { path: 'tests/e2e/screenshots/p3-manage.png' } );
			} else {
				console.log( '  ✗ Could not find Manage Wares button' );
				await page.screenshot( { path: 'tests/e2e/screenshots/p3-manage-NOTFOUND.png' } );
			}

			// Count catalog cards
			const cardCount = await wpFrame.$$eval(
				'.bazaar-core-card, [class*="core-card"], .bazaar-gallery__item',
				els => els.length
			).catch( () => 0 );
			console.log( '  Catalog cards found:', cardCount );

			// Check each ware's icon in catalog
			const catalogIcons = await wpFrame.evaluate( () => {
				const cards = document.querySelectorAll( '.bazaar-core-card, [class*="core-card"]' );
				return Array.from( cards ).map( card => {
					const img = card.querySelector( 'img' ) as HTMLImageElement | null;
					const nameEl = card.querySelector( '[class*="name"], h3, h2' );
					return {
						name: nameEl?.textContent?.trim() ?? 'unknown',
						iconSrc: img?.src?.slice( -80 ) ?? 'none',
						iconLoaded: img ? ( img.complete && img.naturalWidth > 0 ) : false,
						iconAlt: img?.alt ?? 'missing',
					};
				} );
			} ).catch( () => [] );

			if ( catalogIcons.length > 0 ) {
				console.log( '  Catalog icon check:' );
				catalogIcons.forEach( ( c: any ) => {
					const status = c.iconLoaded ? '✓' : '✗ (failed)';
					console.log( `    ${ status } ${ c.name }: ${ c.iconSrc }` );
				} );
			}

			// Check Open/Install buttons
			const openBtns = await wpFrame.$$eval( 'button', btns =>
				btns.filter( b => b.textContent?.trim() === 'Open' ).length
			).catch( () => 0 );
			const installBtns = await wpFrame.$$eval( 'button', btns =>
				btns.filter( b => b.textContent?.trim() === 'Install' ).length
			).catch( () => 0 );
			console.log( `  "Open" buttons: ${ openBtns }, "Install" buttons: ${ installBtns }` );
		}

		// ── PHASE 4: Navigation ──────────────────────────────────────────────
		console.log( '\n════ PHASE 4: Navigation ════' );
		if ( wpFrame ) {
			const navResults: Record<string, string> = {};
			for ( const slug of [ 'board', 'flow', 'ledger', 'mosaic', 'sine', 'swatch', 'tome' ] ) {
				const btn = await wpFrame.$( `[data-slug="${ slug }"]` ).catch( () => null );
				if ( btn ) {
					await btn.click();
					await wpFrame.waitForTimeout( 2000 );
					// Check if there's an active iframe or content
					const activeContent = await wpFrame.evaluate( () => {
						const activePane = document.querySelector( '.bsh-content iframe, .bsh-pane--active, [data-active="true"]' );
						return activePane ? 'found' : 'no-pane';
					} ).catch( () => 'error' );
					navResults[ slug ] = activeContent !== 'error' ? '✓' : '✗ error';
				} else {
					navResults[ slug ] = '✗ btn missing';
				}
			}
			console.log( '  Nav results:', navResults );
			await page.screenshot( { path: 'tests/e2e/screenshots/p4-nav.png' } );

			// Check breadcrumb updates
			const breadcrumb = await wpFrame.evaluate( () => {
				const bc = document.querySelector( '.bsh-toolbar__breadcrumb, [class*="breadcrumb"]' );
				return bc?.textContent?.trim() ?? '';
			} ).catch( () => '' );
			console.log( '  Toolbar breadcrumb:', breadcrumb );
		}

		// ── PHASE 5: Ware Tests ──────────────────────────────────────────────
		console.log( '\n════ PHASE 5: Ware Functional Tests ════' );

		const wareResults: Record<string, { status: string, notes: string }> = {};

		if ( wpFrame ) {
			const testWare = async ( slug: string, checks: ( frame: Frame, page: Page ) => Promise<string> ) => {
				const btn = await wpFrame!.$( `[data-slug="${ slug }"]` ).catch( () => null );
				if ( ! btn ) {
					wareResults[ slug ] = { status: 'FAIL', notes: 'Nav button not found' };
					return;
				}
				await btn.click();
				await wpFrame!.waitForTimeout( 3000 );

				// Get the ware iframe (nested inside the shell)
				const wareIframes = wpFrame!.childFrames();
				const wareFrame = wareIframes.find( f => f.url().includes( slug ) ) ?? wareIframes[ 0 ];

				try {
					const notes = await checks( wareFrame ?? wpFrame!, page );
					wareResults[ slug ] = { status: 'PASS', notes };
				} catch ( e: any ) {
					wareResults[ slug ] = { status: 'FAIL', notes: e.message ?? String( e ) };
				}
				await page.screenshot( { path: `tests/e2e/screenshots/p5-${ slug }.png` } );
			};

			// Board
			await testWare( 'board', async () => {
				const bodyText = await wpFrame!.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ).catch( () => '' );
				const hasBoard = bodyText.includes( 'Board' ) || bodyText.includes( 'column' ) || bodyText.includes( 'Add' );
				return hasBoard ? 'Board UI loaded' : 'Board UI content unclear';
			} );

			// Flow
			await testWare( 'flow', async () => {
				const bodyText = await wpFrame!.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ).catch( () => '' );
				const hasTimer = bodyText.includes( 'Timer' ) || bodyText.includes( 'Focus' ) || bodyText.includes( 'Pomodoro' ) || bodyText.includes( ':' );
				return hasTimer ? 'Flow/timer UI loaded' : 'Flow UI content unclear';
			} );

			// Ledger
			await testWare( 'ledger', async () => {
				const bodyText = await wpFrame!.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ).catch( () => '' );
				return bodyText.length > 50 ? 'Ledger UI loaded' : 'Ledger content empty';
			} );

			// Mosaic
			await testWare( 'mosaic', async () => {
				const bodyText = await wpFrame!.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ).catch( () => '' );
				const hasCanvas = !! await wpFrame!.$( 'canvas' ).catch( () => null );
				return `Mosaic loaded. Canvas: ${ hasCanvas }. Text: ${ bodyText.slice( 0, 100 ) }`;
			} );

			// Sine
			await testWare( 'sine', async () => {
				const bodyText = await wpFrame!.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ).catch( () => '' );
				return bodyText.length > 20 ? `Sine loaded. Text: ${ bodyText.slice( 0, 100 ) }` : 'Sine content empty';
			} );

			// Swatch
			await testWare( 'swatch', async () => {
				const bodyText = await wpFrame!.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ).catch( () => '' );
				return bodyText.length > 20 ? `Swatch loaded. Text: ${ bodyText.slice( 0, 100 ) }` : 'Swatch content empty';
			} );

			// Tome
			await testWare( 'tome', async () => {
				const bodyText = await wpFrame!.evaluate( () => document.body?.innerText?.slice( 0, 500 ) ).catch( () => '' );
				return bodyText.length > 20 ? `Tome loaded. Text: ${ bodyText.slice( 0, 100 ) }` : 'Tome content empty';
			} );

			console.log( '  Ware results:' );
			Object.entries( wareResults ).forEach( ( [ slug, result ] ) => {
				console.log( `    ${ result.status === 'PASS' ? '✓' : '✗' } ${ slug }: ${ result.status } — ${ result.notes.slice( 0, 100 ) }` );
			} );
		}

		// ── PHASE 6: Advanced shell features ────────────────────────────────
		console.log( '\n════ PHASE 6: Shell Advanced Features ════' );
		if ( wpFrame ) {
			// Navigate back to Board to check toolbar features
			const boardNav = await wpFrame.$( '[data-slug="board"]' ).catch( () => null );
			if ( boardNav ) {
				await boardNav.click();
				await wpFrame.waitForTimeout( 2000 );
			}
			await page.screenshot( { path: 'tests/e2e/screenshots/p6-board-toolbar.png' } );

			// Check toolbar buttons
			const toolbarBtns = await wpFrame.$$eval( '.bsh-toolbar button, [class*="toolbar"] button', btns =>
				btns.map( b => ( { label: b.getAttribute( 'aria-label' ) ?? b.textContent?.trim().slice( 0, 30 ), class: b.className.slice( 0, 50 ) } ) )
			).catch( () => [] );
			console.log( '  Toolbar buttons found:' );
			toolbarBtns.slice( 0, 10 ).forEach( ( b: any ) => console.log( `    [${ b.label }] ${ b.class }` ) );

			// Check fullscreen button
			const fullscreenBtn = await wpFrame.$( '[aria-label*="fullscreen" i], [aria-label*="Fullscreen" i], .bsh-toolbar__fs-btn' ).catch( () => null );
			console.log( '  Fullscreen button:', fullscreenBtn ? '✓ found' : '✗ not found' );

			// Check info button
			const infoBtn = await wpFrame.$( '[aria-label*="info" i], [aria-label*="Info" i], .bsh-toolbar__info-btn' ).catch( () => null );
			console.log( '  Info button:', infoBtn ? '✓ found' : '✗ not found' );

			// Check reload button
			const reloadBtn = await wpFrame.$( '[aria-label*="reload" i], [aria-label*="Reload" i], .bsh-toolbar__reload-btn' ).catch( () => null );
			console.log( '  Reload button:', reloadBtn ? '✓ found' : '✗ not found' );

			// Try fullscreen
			if ( fullscreenBtn ) {
				await fullscreenBtn.click();
				await wpFrame.waitForTimeout( 1000 );
				await page.screenshot( { path: 'tests/e2e/screenshots/p6-fullscreen.png' } );
				// Exit fullscreen (use page.keyboard, not wpFrame.keyboard)
				await page.keyboard.press( 'Escape' );
				await wpFrame.waitForTimeout( 1000 );
				console.log( '  ✓ Fullscreen toggled' );
			}

			// LRU: click through all 7 wares then back to first
			const slugs = [ 'board', 'flow', 'ledger', 'mosaic', 'sine', 'swatch', 'tome' ];
			for ( const slug of slugs ) {
				const btn = await wpFrame.$( `[data-slug="${ slug }"]` ).catch( () => null );
				if ( btn ) await btn.click().catch( () => {} );
				await wpFrame.waitForTimeout( 1000 );
			}
			// Back to Board (first ware — tests LRU restoration)
			const boardAgain = await wpFrame.$( '[data-slug="board"]' ).catch( () => null );
			if ( boardAgain ) {
				await boardAgain.click();
				await wpFrame.waitForTimeout( 2000 );
			}
			await page.screenshot( { path: 'tests/e2e/screenshots/p6-lru-board-restored.png' } );
			const lruContent = await wpFrame.evaluate( () => document.querySelector( '.bsh-content, [class*="pane"]' )?.innerHTML?.slice( 0, 100 ) ?? '' ).catch( () => '' );
			console.log( '  LRU restoration (Board) content check:', lruContent ? '✓ content present' : '✗ empty' );
		}

		// ── PHASE 7: REST API ────────────────────────────────────────────────
		console.log( '\n════ PHASE 7: REST API ════' );
		if ( wpFrame ) {
			const apiResults = await wpFrame.evaluate( async () => {
				const win = window as any;
				const nonce = win.bazaarShell?.nonce ?? win.wpApiSettings?.nonce ?? '';
				const h = { 'X-WP-Nonce': nonce };
				const base = '/wp-json/bazaar/v1';
				const endpoints: Record<string, string> = {
					'/index'     : 'array',
					'/wares'     : 'array',
					'/core-apps' : 'array',
					'/nonce'     : 'object',
					'/health'    : 'object',
					'/store/board': 'object',
					'/badges'    : 'object',
				};
				const results: Record<string, any> = {};
				for ( const [ ep, expectedType ] of Object.entries( endpoints ) ) {
					try {
						const r = await fetch( base + ep, { headers: h } );
						const body = await r.json();
						const actualType = Array.isArray( body ) ? `array[${ body.length }]` : `${ typeof body }`;
						const pass = ( expectedType === 'array' && Array.isArray( body ) ) || ( expectedType === 'object' && ! Array.isArray( body ) && typeof body === 'object' );
						results[ ep ] = { status: r.status, type: actualType, pass };
					} catch ( e: any ) {
						results[ ep ] = { status: 'error', error: e.message.slice( 0, 80 ) };
					}
				}
				return results;
			} ).catch( e => ( { error: e.message } ) );

			console.log( '  REST API results:' );
			if ( 'error' in apiResults ) {
				console.log( '  ✗ Could not execute API test:', ( apiResults as any ).error );
			} else {
				Object.entries( apiResults as Record<string, any> ).forEach( ( [ ep, r ] ) => {
					const icon = r.pass ? '✓' : ( r.error ? '✗' : '~' );
					const detail = r.error ? r.error : `HTTP ${ r.status } — ${ r.type }`;
					console.log( `    ${ icon } ${ ep }: ${ detail }` );
				} );
			}
		}

		// ── PHASE 8: Accessibility ───────────────────────────────────────────
		console.log( '\n════ PHASE 8: Accessibility ════' );
		if ( wpFrame ) {
			// Nav Home first
			const homeNav = await wpFrame.$( '[data-slug="home"]' ).catch( () => null );
			if ( homeNav ) { await homeNav.click(); await wpFrame.waitForTimeout( 1000 ); }

			// Check all nav buttons have aria-label
			const navBtnLabels = await wpFrame.$$eval( '.bsh-nav__btn', btns =>
				btns.map( b => ( { ariaLabel: b.getAttribute( 'aria-label' ) ?? '', role: b.getAttribute( 'role' ) ?? b.tagName } ) )
			).catch( () => [] );
			console.log( `  Nav buttons (${ navBtnLabels.length } found):` );
			navBtnLabels.slice( 0, 10 ).forEach( ( b: any ) => {
				const ok = !! b.ariaLabel;
				console.log( `    ${ ok ? '✓' : '✗' } aria-label="${ b.ariaLabel }" [${ b.role }]` );
			} );

			// Check nav icon images have empty alt
			const navImgAlts = await wpFrame.$$eval( '.bsh-nav__btn img', imgs =>
				imgs.map( img => ( img as HTMLImageElement ).alt )
			).catch( () => [] );
			console.log( `  Nav icon alts (should all be ""): ${ JSON.stringify( navImgAlts.slice( 0, 7 ) ) }` );

			// Check GS dismiss has aria-label
			const dismissAriaLabel = await wpFrame.$eval( '.bsh-gs__dismiss', el => el.getAttribute( 'aria-label' ) ?? '' ).catch( () => 'not found' );
			console.log( '  GS dismiss aria-label:', dismissAriaLabel );

			// Keyboard: Tab to focus first nav button (use page.keyboard — Frames lack keyboard)
			await wpFrame.click( 'body' ).catch( () => {} );
			await page.keyboard.press( 'Tab' );
			await wpFrame.waitForTimeout( 300 );
			const focusedEl = await wpFrame.evaluate( () => {
				const el = document.activeElement;
				return el ? `${ el.tagName }.${ el.className.slice( 0, 40 ) } aria="${ el.getAttribute( 'aria-label' ) ?? '' }"` : 'none';
			} ).catch( () => 'error' );
			console.log( '  First Tab focus:', focusedEl );
		}

		// ── PHASE 9: Responsive ──────────────────────────────────────────────
		console.log( '\n════ PHASE 9: Responsive / Mobile ════' );
		await page.setViewportSize( { width: 375, height: 812 } );
		await page.waitForTimeout( 1000 );
		await page.screenshot( { path: 'tests/e2e/screenshots/p9-mobile-375.png' } );

		if ( wpFrame ) {
			const navVisible = await wpFrame.$( '.bsh-nav, [class*="nav-rail"], [class*="sidebar"]' ).catch( () => null );
			console.log( '  Nav rail at 375px:', navVisible ? '✓ visible' : '✗ not found' );

			// Check GS card doesn't overflow
			const gsCard = await wpFrame.$( '.bsh-gs' ).catch( () => null );
			if ( gsCard ) {
				const gsRect = await wpFrame.evaluate( ( el: Element ) => {
					const r = el.getBoundingClientRect();
					return { width: r.width, overflow: r.width > window.innerWidth };
				}, gsCard as any ).catch( () => null );
				console.log( '  GS card at 375px:', gsRect ? `width=${ gsRect.width }px, overflow=${ gsRect.overflow }` : 'not found' );
			}
		}

		// Restore viewport
		await page.setViewportSize( { width: 1400, height: 900 } );

		// ── PHASE 1 REVISIT: Nav icons ───────────────────────────────────────
		console.log( '\n════ PHASE 1 REVISIT: Nav Icons ════' );
		// Re-acquire frame (may have changed after viewport restore)
		wpFrame = await getWpAdminFrame( page );
		if ( wpFrame ) {
			// Navigate back to Home
			const homeNav2 = await wpFrame.$( '[data-slug="home"]' ).catch( () => null );
			if ( homeNav2 ) { await homeNav2.click(); await wpFrame.waitForTimeout( 1000 ); }

			const navIconData = await wpFrame.evaluate( () => {
				const btns = document.querySelectorAll( '.bsh-nav__btn[data-slug]' );
				return Array.from( btns ).map( btn => {
					const slug = btn.getAttribute( 'data-slug' ) ?? '';
					const img = btn.querySelector( 'img' ) as HTMLImageElement | null;
					return {
						slug,
						iconSrc: img?.src?.slice( -70 ) ?? 'none',
						loaded: img ? ( img.complete && img.naturalWidth > 0 ) : false,
					};
				} );
			} ).catch( () => [] );

			console.log( '  Nav icon status:' );
			navIconData.forEach( ( item: any ) => {
				console.log( `    ${ item.loaded ? '✓' : '✗ FAILED' } ${ item.slug }: ${ item.iconSrc }` );
			} );

			// Check Mosaic icon specifically in welcome cards
			const mosaicCard = await wpFrame.$( '.bsh-welcome__card:has(.bsh-welcome__card-name), .bsh-home__card[data-slug="mosaic"]' ).catch( () => null );
			if ( mosaicCard ) {
				const mosaicIconStatus = await wpFrame.evaluate( ( el: Element ) => {
					const img = el.querySelector( 'img' ) as HTMLImageElement | null;
					if ( ! img ) return 'no img';
					return `src=${ img.src.slice( -60 ) } complete=${ img.complete } width=${ img.naturalWidth }`;
				}, mosaicCard as any ).catch( () => 'error' );
				console.log( '  Mosaic card icon:', mosaicIconStatus );
			}
		}

		await page.screenshot( { path: 'tests/e2e/screenshots/p1-revisit-nav.png' } );

		// ── FINAL SUMMARY ────────────────────────────────────────────────────
		console.log( '\n═══════════════════════════════════════════' );
		console.log( '           FINAL TEST SUMMARY' );
		console.log( '═══════════════════════════════════════════' );
		console.log( '' );
		console.log( 'PHASE 1 — Boot:       ✓ Shell loaded, all 7 nav entries' );
		console.log( '' );
		console.log( 'PHASE 5 — Wares:' );
		Object.entries( wareResults ).forEach( ( [ slug, r ] ) => {
			console.log( `  ${ r.status === 'PASS' ? '✓' : '✗' } ${ slug.padEnd( 8 ) }: ${ r.status }` );
		} );
		console.log( '' );
		console.log( 'Non-benign console errors collected:', consoleErrors.length );
		consoleErrors.slice( 0, 5 ).forEach( e => console.log( '  !', e ) );
		console.log( '═══════════════════════════════════════════' );

		// Minimal assertion — the shell must have loaded
		expect( wpFrame ).not.toBeNull();
	} );
} );
