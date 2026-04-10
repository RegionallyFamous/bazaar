/**
 * Jest stubs for Bazaar admin UI.
 *
 * Full UI integration tests require @wordpress/e2e-test-utils-playwright + wp-env.
 * These unit tests cover pure JS logic only.
 */

describe( 'Bazaar admin escaping helpers', () => {
	/**
	 * Inline copies of the escHtml/escAttr helpers from main.js.
	 * In a full setup these would be imported from a shared module.
	 */
	function escHtml( str ) {
		return String( str )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#39;' );
	}

	test( 'escapes HTML special characters', () => {
		expect( escHtml( '<script>alert("xss")</script>' ) ).toBe(
			'&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
		);
	} );

	test( 'escapes ampersands', () => {
		expect( escHtml( 'Tom & Jerry' ) ).toBe( 'Tom &amp; Jerry' );
	} );

	test( 'escapes single quotes', () => {
		expect( escHtml( "it's here" ) ).toBe( 'it&#39;s here' );
	} );

	test( 'passes through safe strings untouched', () => {
		expect( escHtml( 'Invoice Generator' ) ).toBe( 'Invoice Generator' );
	} );
} );

describe( 'Bazaar file extension check', () => {
	function isWpFile( name ) {
		return name.endsWith( '.wp' );
	}

	test( 'accepts .wp extension', () => {
		expect( isWpFile( 'invoice-generator.wp' ) ).toBe( true );
	} );

	test( 'rejects .zip extension', () => {
		expect( isWpFile( 'archive.zip' ) ).toBe( false );
	} );

	test( 'rejects .php extension', () => {
		expect( isWpFile( 'shell.php' ) ).toBe( false );
	} );
} );
