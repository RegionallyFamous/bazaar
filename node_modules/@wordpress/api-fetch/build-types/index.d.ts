/**
 * Internal dependencies
 */
import createNonceMiddleware from './middlewares/nonce';
import createRootURLMiddleware from './middlewares/root-url';
import createPreloadingMiddleware from './middlewares/preloading';
import fetchAllMiddleware from './middlewares/fetch-all-middleware';
import mediaUploadMiddleware from './middlewares/media-upload';
import createThemePreviewMiddleware from './middlewares/theme-preview';
import type { APIFetchMiddleware, APIFetchOptions, FetchHandler } from './types';
export interface ApiFetch {
    <T, Parse extends boolean = true>(options: APIFetchOptions<Parse>): Promise<Parse extends true ? T : Response>;
    nonceEndpoint?: string;
    nonceMiddleware?: ReturnType<typeof createNonceMiddleware>;
    use: (middleware: APIFetchMiddleware) => void;
    setFetchHandler: (newFetchHandler: FetchHandler) => void;
    createNonceMiddleware: typeof createNonceMiddleware;
    createPreloadingMiddleware: typeof createPreloadingMiddleware;
    createRootURLMiddleware: typeof createRootURLMiddleware;
    fetchAllMiddleware: typeof fetchAllMiddleware;
    mediaUploadMiddleware: typeof mediaUploadMiddleware;
    createThemePreviewMiddleware: typeof createThemePreviewMiddleware;
}
/**
 * Fetch
 *
 * @param options The options for the fetch.
 * @return A promise representing the request processed via the registered middlewares.
 */
declare const apiFetch: ApiFetch;
export default apiFetch;
export type * from './types';
//# sourceMappingURL=index.d.ts.map