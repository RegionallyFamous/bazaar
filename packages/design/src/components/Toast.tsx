import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
	type ReactNode,
} from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

export type ToastVariant = 'default' | 'success' | 'warning' | 'error';

export interface ToastItem {
	id:       string;
	message:  string;
	variant?: ToastVariant;
	leaving?: boolean;
}

type Action =
	| { type: 'add';    payload: ToastItem }
	| { type: 'leave';  id: string }
	| { type: 'remove'; id: string };

function reducer( state: ToastItem[], action: Action ): ToastItem[] {
	switch ( action.type ) {
		case 'add':
			return [ ...state, action.payload ];
		case 'leave':
			return state.map( t => t.id === action.id ? { ...t, leaving: true } : t );
		case 'remove':
			return state.filter( t => t.id !== action.id );
		default:
			return state;
	}
}

// ── Context ───────────────────────────────────────────────────────────────

type ShowToastFn = ( message: string, variant?: ToastVariant, duration?: number ) => void;

const ToastContext = createContext<ShowToastFn>( () => {} );

// ── Provider ──────────────────────────────────────────────────────────────

export interface ToastProviderProps {
	children: ReactNode;
}

export function ToastProvider( { children }: ToastProviderProps ) {
	const [ toasts, dispatch ] = useReducer( reducer, [] );
	const counter  = useRef( 0 );
	// Track all active timer IDs so they can be cleared on unmount.
	const timersRef = useRef<ReturnType<typeof setTimeout>[]>( [] );

	useEffect( () => {
		return () => {
			timersRef.current.forEach( clearTimeout );
			timersRef.current = [];
		};
	}, [] );

	const showToast = useCallback( (
		message: string,
		variant: ToastVariant = 'default',
		duration = 3500,
	) => {
		const id = `toast-${ ++counter.current }`;
		dispatch( { type: 'add', payload: { id, message, variant } } );

		const leaveTimer = setTimeout( () => {
			dispatch( { type: 'leave', id } );
			const removeTimer = setTimeout( () => dispatch( { type: 'remove', id } ), 200 );
			timersRef.current.push( removeTimer );
		}, duration );
		timersRef.current.push( leaveTimer );
	}, [] );

	return (
		<ToastContext.Provider value={ showToast }>
			{ children }
			<div className="bw-toasts" aria-live="polite" aria-atomic="true">
				{ toasts.map( toast => (
					<div
						key={ toast.id }
						className={ [
							'bw-toast',
							toast.variant && toast.variant !== 'default' && `bw-toast--${ toast.variant }`,
							toast.leaving && 'bw-toast--out',
						].filter( Boolean ).join( ' ' ) }
					>
						<span className="bw-toast__msg">{ toast.message }</span>
					</div>
				) ) }
			</div>
		</ToastContext.Provider>
	);
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Returns a `showToast(message, variant?, duration?)` function.
 * Must be called inside a `<ToastProvider>`.
 */
export function useToast(): ShowToastFn {
	return useContext( ToastContext );
}
