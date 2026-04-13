import { useState, useEffect, useCallback, useRef } from 'react';
import { __ }                                        from '@wordpress/i18n';
import type { Invoice, Client, InvoiceStatus, View } from './types.ts';
import { loadClients, saveClients, loadInvoices, saveInvoices, loadNextNumber, saveNextNumber } from './store.ts';
import Dashboard   from './views/Dashboard.tsx';
import InvoiceList from './views/InvoiceList.tsx';
import InvoiceEditor from './views/InvoiceEditor.tsx';
import ClientList  from './views/ClientList.tsx';
import './App.css';

function newInvoice( number: string ): Invoice {
	const today = new Date().toISOString().split( 'T' )[ 0 ]!;
	const due   = new Date( Date.now() + 30 * 86400000 ).toISOString().split( 'T' )[ 0 ]!;
	return {
		id:              crypto.randomUUID(),
		number,
		clientId:        '',
		status:          'draft',
		lineItems:       [ { id: crypto.randomUUID(), description: '', qty: 1, rate: 0 } ],
		taxPercent:      0,
		discountPercent: 0,
		issueDate:       today,
		dueDate:         due,
		notes:           '',
		createdAt:       new Date().toISOString(),
		_isNew:          true,
	};
}

function buildNav(): { id: View; label: string }[] {
	return [
		{ id: 'dashboard', label: __( 'Dashboard', 'bazaar' ) },
		{ id: 'invoices',  label: __( 'Invoices',  'bazaar' ) },
		{ id: 'clients',   label: __( 'Clients',   'bazaar' ) },
	];
}

export default function App() {
	const [ view, setView ]                   = useState<View>( 'dashboard' );
	const [ editId, setEditId ]               = useState<string | null>( null );
	const [ stagedInvoice, setStagedInvoice ] = useState<Invoice | null>( null );
	const [ invoices, setInvoices ]           = useState<Invoice[]>( [] );
	const [ clients, setClients ]             = useState<Client[]>( [] );
	const [ nextNum, setNextNum ]             = useState( 1 );
	const [ loading, setLoading ]             = useState( true );
	const [ loadError, setLoadError ]         = useState( false );
	const [ saveError, setSaveError ]         = useState<string | null>( null );
	const loadAttempt                         = useRef( 0 );

	const loadData = useCallback( () => {
		setLoading( true );
		setLoadError( false );
		const attempt = ++loadAttempt.current;
		Promise.all( [ loadClients(), loadInvoices(), loadNextNumber() ] )
			.then( ( [ c, i, n ] ) => {
				if ( attempt !== loadAttempt.current ) return;
				setClients( c );
				setInvoices( i );
				setNextNum( n );
			} )
			.catch( () => {
				if ( attempt === loadAttempt.current ) setLoadError( true );
			} )
			.finally( () => {
				if ( attempt === loadAttempt.current ) setLoading( false );
			} );
	}, [] );

	useEffect( () => {
		loadData();
	}, [ loadData ] );

	const navigate = useCallback( ( v: View, id?: string ) => {
		if ( v === 'new-invoice' ) {
			setStagedInvoice( newInvoice( `INV-${ String( nextNum ).padStart( 3, '0' ) }` ) );
		} else {
			setStagedInvoice( null );
		}
		setSaveError( null );
		setView( v );
		setEditId( id ?? null );
	}, [ nextNum ] );

	const handleSaveInvoice = useCallback( async ( inv: Invoice ) => {
		try {
			const { _isNew: _stripInvoiceNew, ...toSave } = inv;
			const isNew = ! invoices.find( i => i.id === toSave.id );
			let updated: Invoice[];
			let nextNumUpdated = nextNum;

			if ( isNew ) {
				updated        = [ toSave, ...invoices ];
				nextNumUpdated = nextNum + 1;
				await saveNextNumber( nextNumUpdated );
				setNextNum( nextNumUpdated );
			} else {
				updated = invoices.map( i => i.id === toSave.id ? toSave : i );
			}

			setInvoices( updated );
			await saveInvoices( updated );
			setSaveError( null );
			navigate( 'invoices' );
	} catch {
		setSaveError( __( 'Failed to save invoice. Please try again.', 'bazaar' ) );
	}
	}, [ invoices, nextNum, navigate ] );

	const handleDeleteInvoice = useCallback( async ( id: string ) => {
		try {
			const updated = invoices.filter( i => i.id !== id );
			setInvoices( updated );
			await saveInvoices( updated );
			setSaveError( null );
		} catch {
			setSaveError( __( 'Failed to delete invoice. Please try again.', 'bazaar' ) );
		}
	}, [ invoices ] );

	const handleStatusChange = useCallback( async ( id: string, status: InvoiceStatus ) => {
		const updated = invoices.map( i => i.id === id ? { ...i, status } : i );
		setInvoices( updated );
		await saveInvoices( updated );
	}, [ invoices ] );

	const handleSaveClient = useCallback( async ( client: Client ) => {
		try {
			const { _isNew: _stripClientNew, ...toSave } = client;
			const updated = clients.find( c => c.id === toSave.id )
				? clients.map( c => c.id === toSave.id ? toSave : c )
				: [ toSave, ...clients ];
			setClients( updated );
			await saveClients( updated );
			setSaveError( null );
		} catch {
			setSaveError( __( 'Failed to save client. Please try again.', 'bazaar' ) );
		}
	}, [ clients ] );

	const handleDeleteClient = useCallback( async ( id: string ) => {
		try {
			const updated = clients.filter( c => c.id !== id );
			setClients( updated );
			await saveClients( updated );
			setSaveError( null );
		} catch {
			setSaveError( __( 'Failed to delete client. Please try again.', 'bazaar' ) );
		}
	}, [ clients ] );

	if ( loading ) {
		return (
			<div className="app">
				<div className="loading">{ __( 'Loading…', 'bazaar' ) }</div>
			</div>
		);
	}

	if ( loadError ) {
		return (
			<div className="app">
				<div className="loading">
					<p style={ { marginBottom: '12px', color: 'var(--bw-danger)' } }>
						{ __( 'Failed to load data. Check your connection and try again.', 'bazaar' ) }
					</p>
					<button className="btn btn--primary" onClick={ loadData }>
						{ __( 'Retry', 'bazaar' ) }
					</button>
				</div>
			</div>
		);
	}

	const activeInvoice  = editId ? invoices.find( i => i.id === editId ) : null;
	const editingInvoice = view === 'edit-invoice' && activeInvoice
		? activeInvoice
		: view === 'new-invoice' && stagedInvoice
			? stagedInvoice
			: null;

	const NAV = buildNav();

	return (
		<div className="app">
			<nav className="app-nav">
				<div className="app-nav__brand">
					<svg className="app-nav__logo" viewBox="0 0 14 17" fill="none" width="14" height="17" aria-hidden="true">
						<rect x="1" y="1" width="12" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
						<path d="M4 5.5h6M4 8h6M4 10.5h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
					</svg>
					<span className="app-nav__title">{ __( 'Ledger', 'bazaar' ) }</span>
				</div>
				<div className="app-nav__links">
					{ NAV.map( n => (
						<button
							key={ n.id }
							className={ `nav-link${ view === n.id ? ' nav-link--active' : '' }` }
							onClick={ () => navigate( n.id ) }
						>
							{ n.label }
						</button>
					) ) }
				</div>
			</nav>

		<main className="app-main">
			{ saveError && (
				<div className="error-banner" role="alert">
					{ saveError }
					<button className="error-banner__dismiss" aria-label={ __( 'Dismiss error', 'bazaar' ) } onClick={ () => setSaveError( null ) }>✕</button>
				</div>
			) }
			{ editingInvoice ? (
			<InvoiceEditor
				invoice={ editingInvoice }
				isNew={ !! editingInvoice._isNew }
				clients={ clients }
				onSave={ handleSaveInvoice }
				onCancel={ () => navigate( 'invoices' ) }
			/>
				) : view === 'invoices' ? (
					<InvoiceList
						invoices={ invoices }
						clients={ clients }
						onNavigate={ navigate }
						onDeleteInvoice={ handleDeleteInvoice }
						onStatusChange={ handleStatusChange }
					/>
				) : view === 'clients' ? (
					<ClientList
						clients={ clients }
						onSaveClient={ handleSaveClient }
						onDeleteClient={ handleDeleteClient }
					/>
				) : (
					<Dashboard
						invoices={ invoices }
						clients={ clients }
						onNavigate={ navigate }
					/>
				) }
			</main>
		</div>
	);
}
