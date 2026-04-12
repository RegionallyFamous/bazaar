/**
 * Bazaar manage page — drag-drop / click-to-upload .wp files.
 *
 * Exports `initUpload` which wires all upload UI and returns `{ showError, showSuccess }`
 * so other modules can surface notices in the same notification area.
 */

import { __ } from '@wordpress/i18n';
import { UPLOAD_ERROR_HIDE_MS, UPLOAD_SUCCESS_HIDE_MS } from '../shared/constants.js';

/**
 * Wire upload UI and return shared notice helpers.
 *
 * @param {Object}                 deps
 * @param {HTMLElement}            deps.dropzone      Drop target element.
 * @param {HTMLInputElement}       deps.fileInput     Hidden file input.
 * @param {HTMLElement}            deps.progress      Progress container.
 * @param {HTMLElement}            deps.progressBar   Progress bar fill.
 * @param {HTMLElement}            deps.progressLabel Progress status label.
 * @param {HTMLElement}            deps.errorBox      Error notice element.
 * @param {HTMLElement}            deps.successBox    Success notice element.
 * @param {string}                 deps.restUrl       REST base URL.
 * @param {string}                 deps.nonce         WordPress REST nonce.
 * @param {(ware: Object) => void} deps.onSuccess     Called after a successful upload.
 * @return {{ showError: (msg: string) => void, showSuccess: (msg: string) => void }} Notice helpers shared with other modules.
 */
export function initUpload( deps ) {
	const {
		dropzone,
		fileInput,
		progress,
		progressBar,
		progressLabel,
		errorBox,
		successBox,
		restUrl,
		nonce,
		onSuccess,
	} = deps;

	let currentXhr = null;
	let successTimer = null;
	let errorTimer = null;

	function showError( msg ) {
		errorBox.textContent = msg;
		errorBox.hidden = false;
		successBox.hidden = true;
		clearTimeout( successTimer );
		clearTimeout( errorTimer );
		errorTimer = setTimeout( () => {
			errorBox.hidden = true;
		}, UPLOAD_ERROR_HIDE_MS );
	}

	function showSuccess( msg ) {
		successBox.textContent = msg;
		successBox.hidden = false;
		errorBox.hidden = true;
		clearTimeout( successTimer );
		successTimer = setTimeout( () => {
			successBox.hidden = true;
		}, UPLOAD_SUCCESS_HIDE_MS );
	}

	function setProgress( pct ) {
		progress.hidden = false;
		progressBar.classList.remove( 'bazaar-upload-progress__bar--indeterminate' );
		progressBar.style.width = `${ Math.min( 100, pct ) }%`;
	}

	function setProgressIndeterminate() {
		progress.hidden = false;
		progressBar.classList.add( 'bazaar-upload-progress__bar--indeterminate' );
	}

	function resetProgress() {
		progress.hidden = true;
		progressBar.classList.remove( 'bazaar-upload-progress__bar--indeterminate' );
		progressBar.style.width = '0%';
		progressLabel.textContent = __( 'Uploading…', 'bazaar' );
	}

	/**
	 * Upload via XHR for genuine upload-progress events.
	 * Resolves with the parsed JSON response on HTTP 2xx; rejects otherwise.
	 *
	 * @param {File} file
	 * @return {Promise<{message: string, ware: Object}>} Parsed server response.
	 */
	function xhrUpload( file ) {
		return new Promise( ( resolve, reject ) => {
			const xhr = new XMLHttpRequest();
			const url = ( restUrl || '' ) + '/wares';

			xhr.upload.addEventListener( 'progress', ( e ) => {
				if ( e.lengthComputable ) {
					// Scale to 0–80 %; the remaining 20 % covers server-side install.
					setProgress( Math.round( ( e.loaded / e.total ) * 80 ) );
				}
			} );

			xhr.upload.addEventListener( 'load', () => {
				setProgressIndeterminate();
				progressLabel.textContent = __( 'Installing…', 'bazaar' );
			} );

			xhr.addEventListener( 'load', () => {
				let data;
				try {
					data = JSON.parse( xhr.responseText );
				} catch {
					reject( new Error( __( 'Invalid server response.', 'bazaar' ) ) );
					return;
				}
				if ( xhr.status >= 200 && xhr.status < 300 ) {
					resolve( data );
				} else {
					reject( new Error( data?.message ?? `HTTP ${ xhr.status }` ) );
				}
			} );

			xhr.addEventListener( 'error', () =>
				reject( new Error( __( 'Network error. Please try again.', 'bazaar' ) ) )
			);

			// 'abort' is a sentinel we handle quietly.
			xhr.addEventListener( 'abort', () => reject( new Error( 'abort' ) ) );

			xhr.open( 'POST', url );
			xhr.setRequestHeader( 'X-WP-Nonce', nonce || '' );

			const formData = new FormData();
			formData.append( 'file', file );
			xhr.send( formData );

			currentXhr = xhr;
		} );
	}

	async function handleUpload( file ) {
		if ( ! file.name.endsWith( '.wp' ) ) {
			showError( __( 'Please select a file with a .wp extension.', 'bazaar' ) );
			return;
		}

		errorBox.hidden = true;
		successBox.hidden = true;
		setProgress( 1 );
		dropzone.classList.add( 'bazaar-dropzone--uploading' );

		try {
			const response = await xhrUpload( file );
			setProgress( 100 );
			showSuccess( response.message );
			if ( response?.ware ) {
				onSuccess( response.ware );
			}
		} catch ( err ) {
			if ( err.message !== 'abort' ) {
				showError(
					err.message || __( 'Upload failed. Please try again.', 'bazaar' )
				);
			}
		} finally {
			resetProgress();
			dropzone.classList.remove( 'bazaar-dropzone--uploading' );
			fileInput.value = '';
			currentXhr = null;
		}
	}

	// ── Event wiring ────────────────────────────────────────────────────────

	dropzone.addEventListener( 'click', () => fileInput.click() );

	dropzone.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Enter' || e.key === ' ' ) {
			e.preventDefault();
			fileInput.click();
		}
		if ( e.key === 'Escape' && currentXhr ) {
			currentXhr.abort();
		}
	} );

	fileInput.addEventListener( 'change', () => {
		const file = fileInput.files?.[ 0 ];
		if ( file ) {
			handleUpload( file );
		}
		dropzone.focus();
	} );

	dropzone.addEventListener( 'dragover', ( e ) => {
		e.preventDefault();
		dropzone.classList.add( 'bazaar-dropzone--hover' );
	} );

	dropzone.addEventListener( 'dragleave', ( e ) => {
		if ( dropzone.contains( e.relatedTarget ) ) {
			return;
		}
		dropzone.classList.remove( 'bazaar-dropzone--hover' );
	} );

	dropzone.addEventListener( 'drop', ( e ) => {
		e.preventDefault();
		dropzone.classList.remove( 'bazaar-dropzone--hover' );
		const file = e.dataTransfer?.files?.[ 0 ];
		if ( file ) {
			handleUpload( file );
		}
	} );

	return { showError, showSuccess };
}
