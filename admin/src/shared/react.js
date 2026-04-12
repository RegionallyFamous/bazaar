/**
 * Bazaar shared bundle — React.
 *
 * Re-exported as an ES module so the shell can host a single versioned copy
 * that all ware iframes reference via the injected importmap. The content-hashed
 * URL is cached by the browser after the first load; subsequent iframes get the
 * compiled bytecode from the V8 code cache with zero re-download.
 */
// Explicit named exports — required because React is a CJS package and
// Rollup cannot statically analyse `export * from 'react'` for CJS modules.
export {
	Activity,
	Children,
	Component,
	Fragment,
	Profiler,
	PureComponent,
	StrictMode,
	Suspense,
	__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
	__COMPILER_RUNTIME,
	act,
	cache,
	cacheSignal,
	captureOwnerStack,
	cloneElement,
	createContext,
	createElement,
	createRef,
	forwardRef,
	isValidElement,
	lazy,
	memo,
	startTransition,
	unstable_useCacheRefresh,
	use,
	useActionState,
	useCallback,
	useContext,
	useDebugValue,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
	version,
} from 'react';
export { default } from 'react';
