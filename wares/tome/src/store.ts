import { getBazaarContext, createStore } from '@bazaar/client';
import type { Page } from './types.ts';

const LS_KEY = 'bzr-tome-pages';

let _store: ReturnType<typeof createStore> | null = null;

function getStore() {
	if ( ! _store ) {
		try {
			const ctx = getBazaarContext();
			_store    = createStore( 'tome', ctx );
		} catch {
			return null;
		}
	}
	return _store;
}

function lsGet(): Page[] {
	try {
		const raw = localStorage.getItem( LS_KEY );
		return raw ? ( JSON.parse( raw ) as Page[] ) : [];
	} catch {
		return [];
	}
}

function lsSet( pages: Page[] ): void {
	try {
		localStorage.setItem( LS_KEY, JSON.stringify( pages ) );
	} catch { /* noop */ }
}

export async function loadPages(): Promise<Page[]> {
	const store = getStore();
	if ( store ) return ( await store.get<Page[]>( 'pages' ) ) ?? [];
	return lsGet();
}

export async function savePages( pages: Page[] ): Promise<void> {
	const store = getStore();
	if ( store ) {
		try { await store.set( 'pages', pages as never ); return; } catch { /* fall through */ }
	}
	lsSet( pages );
}

export function newPage( parentId: string | null = null ): Page {
	const now = new Date().toISOString();
	return {
		id:        `p_${ Date.now() }`,
		title:     'Untitled',
		content:   '',
		parentId,
		createdAt: now,
		updatedAt: now,
	};
}
