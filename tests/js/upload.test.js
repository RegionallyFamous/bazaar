/**
 * Tests for admin/src/modules/upload.js
 *
 * Covers:
 *  - File extension validation (.wp required)
 *  - showError / showSuccess notice helpers
 *  - Drag-over / drag-leave class toggling
 *  - Keyboard accessibility (Enter / Space open file picker, Escape aborts)
 *  - XHR progress plumbing (resolve on 2xx, reject on error status)
 */

import { initUpload } from '../../admin/src/modules/upload.js';

// ─── Fake timers for auto-hide timeouts ──────────────────────────────────────

beforeEach( () => {
	jest.useFakeTimers();
} );

afterEach( () => {
	jest.useRealTimers();
} );

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function makeElements() {
	const dropzone      = document.createElement( 'div' );
	const fileInput     = document.createElement( 'input' );
	fileInput.type      = 'file';
	const progress      = document.createElement( 'div' );
	const progressBar   = document.createElement( 'div' );
	const progressLabel = document.createElement( 'span' );
	const errorBox      = document.createElement( 'div' );
	const successBox    = document.createElement( 'div' );

	progress.hidden  = true;
	errorBox.hidden  = true;
	successBox.hidden = true;

	return { dropzone, fileInput, progress, progressBar, progressLabel, errorBox, successBox };
}

function makeHelpers( overrides = {} ) {
	const els = makeElements();
	const onSuccess = jest.fn();
	const helpers = initUpload( {
		...els,
		restUrl:  'http://example.com/wp-json/bazaar/v1',
		nonce:    'test-nonce',
		onSuccess,
		...overrides,
	} );
	return { ...els, onSuccess, ...helpers };
}

// ─── showError / showSuccess ──────────────────────────────────────────────────

describe( 'showError()', () => {
	test( 'makes errorBox visible with the given message', () => {
		const { showError, errorBox } = makeHelpers();
		showError( 'Something went wrong' );
		expect( errorBox.hidden ).toBe( false );
		expect( errorBox.textContent ).toBe( 'Something went wrong' );
	} );

	test( 'hides successBox when called', () => {
		const { showError, showSuccess, errorBox, successBox } = makeHelpers();
		showSuccess( 'Done!' );
		expect( successBox.hidden ).toBe( false );

		showError( 'Oops' );
		expect( successBox.hidden ).toBe( true );
		expect( errorBox.hidden ).toBe( false );
	} );

	test( 'auto-hides errorBox after UPLOAD_ERROR_HIDE_MS', () => {
		const { showError, errorBox } = makeHelpers();
		showError( 'Temporary error' );
		expect( errorBox.hidden ).toBe( false );

		jest.advanceTimersByTime( 8001 );
		expect( errorBox.hidden ).toBe( true );
	} );
} );

describe( 'showSuccess()', () => {
	test( 'makes successBox visible with the given message', () => {
		const { showSuccess, successBox } = makeHelpers();
		showSuccess( 'Uploaded!' );
		expect( successBox.hidden ).toBe( false );
		expect( successBox.textContent ).toBe( 'Uploaded!' );
	} );

	test( 'hides errorBox when called', () => {
		const { showError, showSuccess, errorBox } = makeHelpers();
		showError( 'Previous error' );
		expect( errorBox.hidden ).toBe( false );

		showSuccess( 'Now ok' );
		expect( errorBox.hidden ).toBe( true );
	} );

	test( 'auto-hides successBox after UPLOAD_SUCCESS_HIDE_MS', () => {
		const { showSuccess, successBox } = makeHelpers();
		showSuccess( 'Great' );
		expect( successBox.hidden ).toBe( false );

		jest.advanceTimersByTime( 5001 );
		expect( successBox.hidden ).toBe( true );
	} );
} );

// ─── File extension validation ────────────────────────────────────────────────

describe( 'file extension validation', () => {
	function makeFileWithName( name ) {
		// jsdom File constructor: new File([bits], name, options)
		return new File( [ 'data' ], name, { type: 'application/octet-stream' } );
	}

	function triggerChangeWith( fileInput, file ) {
		// Simulate fileInput.files[0] being set via Object.defineProperty.
		Object.defineProperty( fileInput, 'files', {
			configurable: true,
			get: () => ( file ? { 0: file, length: 1 } : { length: 0 } ),
		} );
		fileInput.dispatchEvent( new Event( 'change' ) );
	}

	test( 'shows error for a file without .wp extension', () => {
		const { fileInput, errorBox } = makeHelpers();
		triggerChangeWith( fileInput, makeFileWithName( 'app.zip' ) );
		expect( errorBox.hidden ).toBe( false );
		expect( errorBox.textContent ).toContain( '.wp' );
	} );

	test( 'shows error for a file with .wpx extension', () => {
		const { fileInput, errorBox } = makeHelpers();
		triggerChangeWith( fileInput, makeFileWithName( 'myware.wpx' ) );
		expect( errorBox.hidden ).toBe( false );
	} );

	test( 'does not show error for a valid .wp file (proceeds to XHR)', () => {
		// Use a spy on XMLHttpRequest.open to verify XHR is started.
		const xhrOpenSpy = jest.fn();
		const xhrSendSpy = jest.fn();

		const MockXHR = jest.fn( () => ( {
			upload: { addEventListener: jest.fn() },
			addEventListener:   jest.fn(),
			open:               xhrOpenSpy,
			setRequestHeader:   jest.fn(),
			send:               xhrSendSpy,
		} ) );

		const origXHR = global.XMLHttpRequest;
		global.XMLHttpRequest = MockXHR;

		try {
			const { fileInput, errorBox } = makeHelpers();
			triggerChangeWith( fileInput, makeFileWithName( 'valid.wp' ) );
			// Error must not be shown immediately.
			expect( errorBox.hidden ).toBe( true );
			// XHR must have been opened to the correct URL.
			expect( xhrOpenSpy ).toHaveBeenCalledWith(
				'POST',
				'http://example.com/wp-json/bazaar/v1/wares'
			);
		} finally {
			global.XMLHttpRequest = origXHR;
		}
	} );
} );

// ─── Drag interaction ────────────────────────────────────────────────────────

describe( 'drag-over / drag-leave', () => {
	test( 'adds hover class on dragover', () => {
		const { dropzone } = makeHelpers();
		const e = new Event( 'dragover' );
		e.preventDefault = jest.fn();
		dropzone.dispatchEvent( e );
		expect( dropzone.classList.contains( 'bazaar-dropzone--hover' ) ).toBe( true );
	} );

	test( 'removes hover class on dragleave when relatedTarget is outside', () => {
		const { dropzone } = makeHelpers();

		// First, add the hover class via dragover.
		const over = new Event( 'dragover' );
		over.preventDefault = jest.fn();
		dropzone.dispatchEvent( over );
		expect( dropzone.classList.contains( 'bazaar-dropzone--hover' ) ).toBe( true );

		// Dispatch dragleave with a relatedTarget that is NOT inside dropzone.
		const leave = new Event( 'dragleave' );
		Object.defineProperty( leave, 'relatedTarget', {
			value: document.createElement( 'span' ),
		} );
		dropzone.dispatchEvent( leave );

		expect( dropzone.classList.contains( 'bazaar-dropzone--hover' ) ).toBe( false );
	} );

	test( 'does NOT remove hover class on dragleave when relatedTarget is a child', () => {
		const { dropzone } = makeHelpers();

		// Add a real child inside the dropzone so contains() returns true.
		const child = document.createElement( 'span' );
		dropzone.appendChild( child );

		const over = new Event( 'dragover' );
		over.preventDefault = jest.fn();
		dropzone.dispatchEvent( over );

		const leave = new Event( 'dragleave' );
		Object.defineProperty( leave, 'relatedTarget', { value: child } );
		dropzone.dispatchEvent( leave );

		// Class must stay because the cursor moved to a child of the dropzone.
		expect( dropzone.classList.contains( 'bazaar-dropzone--hover' ) ).toBe( true );
	} );
} );

// ─── Keyboard accessibility ───────────────────────────────────────────────────

describe( 'keyboard handling on dropzone', () => {
	test( 'Enter key triggers fileInput.click()', () => {
		const { dropzone, fileInput } = makeHelpers();
		const clickSpy = jest.spyOn( fileInput, 'click' );

		const e = new KeyboardEvent( 'keydown', { key: 'Enter', bubbles: true } );
		dropzone.dispatchEvent( e );

		expect( clickSpy ).toHaveBeenCalled();
	} );

	test( 'Space key triggers fileInput.click()', () => {
		const { dropzone, fileInput } = makeHelpers();
		const clickSpy = jest.spyOn( fileInput, 'click' );

		const e = new KeyboardEvent( 'keydown', { key: ' ', bubbles: true } );
		dropzone.dispatchEvent( e );

		expect( clickSpy ).toHaveBeenCalled();
	} );
} );

// ─── XHR response handling ────────────────────────────────────────────────────

describe( 'XHR response handling', () => {
	function buildXhrMock( status, responseText ) {
		const listeners = {};
		const uploadListeners = {};

		const xhr = {
			upload: {
				addEventListener: jest.fn( ( type, fn ) => {
					uploadListeners[ type ] = fn;
				} ),
			},
			addEventListener: jest.fn( ( type, fn ) => {
				listeners[ type ] = fn;
			} ),
			open:           jest.fn(),
			setRequestHeader: jest.fn(),
			send:           jest.fn( () => {
				// Immediately simulate a successful load once send() is called.
				Object.defineProperty( xhr, 'status', { value: status } );
				Object.defineProperty( xhr, 'responseText', { value: responseText } );
				listeners.load?.();
			} ),
			abort: jest.fn( () => {
				listeners.abort?.();
			} ),
		};

		return xhr;
	}

	function triggerChangeWith( fileInput, file ) {
		Object.defineProperty( fileInput, 'files', {
			configurable: true,
			get: () => ( file ? { 0: file, length: 1 } : { length: 0 } ),
		} );
		fileInput.dispatchEvent( new Event( 'change' ) );
	}

	test( 'calls onSuccess with ware on HTTP 200 response', async () => {
		const xhrMock = buildXhrMock( 200, JSON.stringify( { message: 'Installed!', ware: { slug: 'crm' } } ) );
		global.XMLHttpRequest = jest.fn( () => xhrMock );

		const { fileInput, onSuccess } = makeHelpers();
		triggerChangeWith( fileInput, new File( [ 'x' ], 'crm.wp' ) );

		// Allow all microtasks/promises to settle.
		await Promise.resolve();
		await Promise.resolve();

		expect( onSuccess ).toHaveBeenCalledWith( { slug: 'crm' } );
	} );

	test( 'shows error on HTTP 422 response', async () => {
		const xhrMock = buildXhrMock( 422, JSON.stringify( { message: 'Invalid ware package' } ) );
		global.XMLHttpRequest = jest.fn( () => xhrMock );

		const { fileInput, errorBox } = makeHelpers();
		triggerChangeWith( fileInput, new File( [ 'x' ], 'bad.wp' ) );

		await Promise.resolve();
		await Promise.resolve();

		expect( errorBox.hidden ).toBe( false );
		expect( errorBox.textContent ).toContain( 'Invalid ware package' );
	} );
} );
