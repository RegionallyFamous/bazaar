import { createWaredStore } from '@bazaar/client';
import type { Page }         from './types.ts';

const store = createWaredStore( { slug: 'tome', lsPrefix: 'bzr-tome-' } );

export async function loadPages(): Promise<Page[]> {
	return ( await store.load<Page[]>( 'pages' ) ) ?? [];
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
