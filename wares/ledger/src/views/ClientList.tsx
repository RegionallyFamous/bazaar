import { useState, useCallback } from 'react';
import { __, _n, sprintf }       from '@wordpress/i18n';
import type { Client }           from '../types.ts';

interface Props {
	clients:       Client[];
	onSaveClient:  ( client: Client ) => void;
	onDeleteClient:( id: string ) => void;
}

function newClient(): Client {
	return {
		id:        crypto.randomUUID(),
		name:      '',
		email:     '',
		address:   '',
		notes:     '',
		createdAt: new Date().toISOString(),
		_isNew:    true,
	};
}

export default function ClientList( { clients, onSaveClient, onDeleteClient }: Props ) {
	const [ editing, setEditing ]   = useState<Client | null>( null );
	const [ search, setSearch ]     = useState( '' );

	const filtered = clients.filter( c =>
		! search || c.name.toLowerCase().includes( search.toLowerCase() ),
	);

	const handleSave = useCallback( () => {
		if ( ! editing || ! editing.name.trim() ) return;
		onSaveClient( editing );
		setEditing( null );
	}, [ editing, onSaveClient ] );

	return (
		<div className="client-list">
			<div className="view-header">
				<h2 className="view-title">{ __( 'Clients', 'bazaar' ) }</h2>
				<button
					className="btn btn--primary"
					onClick={ () => setEditing( newClient() ) }
				>
					{ __( '+ New Client', 'bazaar' ) }
				</button>
			</div>

			{ editing && (
				<div className="card client-form">
			<h3 className="card__heading">
				{ editing._isNew ? __( 'New Client', 'bazaar' ) : __( 'Edit Client', 'bazaar' ) }
			</h3>
					<div className="field-row">
						<div className="field-group">
							<label className="field-label">{ __( 'Name *', 'bazaar' ) }</label>
							<input
								className="field-input"
								type="text"
								value={ editing.name }
								onChange={ e => setEditing( { ...editing, name: e.target.value } ) }
								placeholder={ __( 'Client or company name', 'bazaar' ) }
								autoFocus
							/>
						</div>
						<div className="field-group">
							<label className="field-label">{ __( 'Email', 'bazaar' ) }</label>
							<input
								className="field-input"
								type="email"
								value={ editing.email }
								onChange={ e => setEditing( { ...editing, email: e.target.value } ) }
								placeholder="client@example.com"
							/>
						</div>
					</div>
					<div className="field-group">
						<label className="field-label">{ __( 'Address', 'bazaar' ) }</label>
						<textarea
							className="field-input field-input--textarea"
							value={ editing.address }
							onChange={ e => setEditing( { ...editing, address: e.target.value } ) }
							placeholder={ __( 'Billing address', 'bazaar' ) }
							rows={ 2 }
						/>
					</div>
					<div className="field-group">
						<label className="field-label">{ __( 'Notes', 'bazaar' ) }</label>
						<input
							className="field-input"
							type="text"
							value={ editing.notes }
							onChange={ e => setEditing( { ...editing, notes: e.target.value } ) }
							placeholder={ __( 'Internal notes', 'bazaar' ) }
						/>
					</div>
					<div className="form-actions">
						<button className="btn btn--ghost" onClick={ () => setEditing( null ) }>
							{ __( 'Cancel', 'bazaar' ) }
						</button>
						<button className="btn btn--primary" onClick={ handleSave }>
							{ __( 'Save Client', 'bazaar' ) }
						</button>
					</div>
				</div>
			) }

			<div className="card">
				<div className="card__heading-row">
					<h3 className="card__heading">
						{ sprintf(
							/* translators: %d: number of clients */
							_n( '%d client', '%d clients', clients.length, 'bazaar' ),
							clients.length
						) }
					</h3>
				<input
					className="search-input search-input--sm"
					type="search"
					placeholder={ __( 'Search…', 'bazaar' ) }
					aria-label={ __( 'Search clients', 'bazaar' ) }
					value={ search }
					onChange={ e => setSearch( e.target.value ) }
				/>
				</div>
				{ filtered.length > 0 ? (
					<table className="inv-table">
						<thead>
							<tr>
								<th>{ __( 'Name', 'bazaar' ) }</th>
								<th>{ __( 'Email', 'bazaar' ) }</th>
								<th>{ __( 'Added', 'bazaar' ) }</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{ filtered.map( c => (
								<tr key={ c.id } className="inv-table__row">
									<td>{ c.name }</td>
									<td className="inv-table__muted">{ c.email || '—' }</td>
									<td className="inv-table__muted">
										{ new Date( c.createdAt ).toLocaleDateString() }
									</td>
								<td className="inv-table__actions">
									<button
										className="action-btn"
										title={ __( 'Edit', 'bazaar' ) }
										aria-label={ sprintf(
											/* translators: %s: client name */
											__( 'Edit %s', 'bazaar' ),
											c.name
										) }
										onClick={ () => setEditing( { ...c } ) }
									>
										✏
									</button>
									<button
										className="action-btn action-btn--danger"
										title={ __( 'Delete', 'bazaar' ) }
										aria-label={ sprintf(
											/* translators: %s: client name */
											__( 'Delete %s', 'bazaar' ),
											c.name
										) }
										onClick={ () => {
											if ( confirm( sprintf(
												/* translators: %s: client name */
												__( 'Delete %s?', 'bazaar' ),
												c.name
											) ) ) {
												onDeleteClient( c.id );
											}
										} }
									>
										✕
									</button>
								</td>
								</tr>
							) ) }
						</tbody>
					</table>
				) : (
					<div className="empty-state">
						<p className="empty-state__text">
							{ search
								? __( 'No clients match.', 'bazaar' )
								: __( 'No clients yet. Add one above.', 'bazaar' ) }
						</p>
					</div>
				) }
			</div>
		</div>
	);
}
