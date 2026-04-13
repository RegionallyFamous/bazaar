/**
 * Internal dependencies
 */
import type { APIFetchMiddleware } from '../types';
/**
 * @param preloadedData
 * @return Preloading middleware.
 */
declare function createPreloadingMiddleware(preloadedData: Record<string, any>): APIFetchMiddleware;
export default createPreloadingMiddleware;
//# sourceMappingURL=preloading.d.ts.map