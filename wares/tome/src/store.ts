import { createWaredStore } from '@bazaar/client';
import type { Page }         from './types.ts';

const store = createWaredStore( { slug: 'tome', lsPrefix: 'bzr-tome-' } );

const isValidPage = ( p: unknown ): p is Page =>
	typeof p === 'object' && p !== null &&
	typeof ( p as Record<string, unknown> ).id === 'string' &&
	typeof ( p as Record<string, unknown> ).title === 'string' &&
	'parentId' in ( p as Record<string, unknown> );

export async function loadPages(): Promise<Page[]> {
	const raw = ( await store.load<unknown[]>( 'pages' ) ) ?? [];
	return raw.filter( isValidPage );
}

export async function savePages( pages: Page[] ): Promise<void> {
	return store.save( 'pages', pages );
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
