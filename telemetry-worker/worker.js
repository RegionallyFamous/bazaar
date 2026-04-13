/**
 * Bazaar telemetry receiver — Cloudflare Worker + D1
 *
 * Accepts POST JSON from opted-in Bazaar plugin installs.
 * Upserts one row per hashed site ID so daily pings just refresh last_seen.
 *
 * Deploy:  wrangler deploy
 * Query:   wrangler d1 execute bazaar-telemetry --command "SELECT ..."
 */
export default {
	async fetch( request, env ) {
		if ( request.method !== 'POST' ) {
			return new Response( '', { status: 405 } );
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return new Response( '', { status: 400 } );
		}

		const { distinct_id, plugin_version, wp_version, php_version, wp_locale, is_multisite } = body;

		if ( ! distinct_id || typeof distinct_id !== 'string' ) {
			return new Response( '', { status: 400 } );
		}

		await env.DB.prepare( `
			INSERT INTO pings (site_hash, plugin_ver, wp_ver, php_ver, locale, multisite)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(site_hash) DO UPDATE SET
				plugin_ver = excluded.plugin_ver,
				wp_ver     = excluded.wp_ver,
				php_ver    = excluded.php_ver,
				locale     = excluded.locale,
				multisite  = excluded.multisite,
				last_seen  = CURRENT_TIMESTAMP
		` ).bind(
			String( distinct_id ).slice( 0, 64 ),
			String( plugin_version || '' ).slice( 0, 20 ),
			String( wp_version     || '' ).slice( 0, 20 ),
			String( php_version    || '' ).slice( 0, 10 ),
			String( wp_locale      || '' ).slice( 0, 20 ),
			is_multisite ? 1 : 0,
		).run();

		return new Response( '{"ok":true}', {
			headers: { 'Content-Type': 'application/json' },
		} );
	},
};
