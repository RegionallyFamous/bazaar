import { useState, useCallback } from 'react';
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
				<h2 className="view-title">Clients</h2>
				<button
					className="btn btn--primary"
					onClick={ () => setEditing( newClient() ) }
				>
					+ New Client
				</button>
			</div>

			{ editing && (
				<div className="card client-form">
					<h3 className="card__heading">
						{ editing.createdAt ? 'Edit Client' : 'New Client' }
					</h3>
					<div className="field-row">
						<div className="field-group">
							<label className="field-label">Name *</label>
							<input
								className="field-input"
								type="text"
								value={ editing.name }
								onChange={ e => setEditing( { ...editing, name: e.target.value } ) }
								placeholder="Client or company name"
								autoFocus
							/>
						</div>
						<div className="field-group">
							<label className="field-label">Email</label>
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
						<label className="field-label">Address</label>
						<textarea
							className="field-input field-input--textarea"
							value={ editing.address }
							onChange={ e => setEditing( { ...editing, address: e.target.value } ) }
							placeholder="Billing address"
							rows={ 2 }
						/>
					</div>
					<div className="field-group">
						<label className="field-label">Notes</label>
						<input
							className="field-input"
							type="text"
							value={ editing.notes }
							onChange={ e => setEditing( { ...editing, notes: e.target.value } ) }
							placeholder="Internal notes"
						/>
					</div>
					<div className="form-actions">
						<button className="btn btn--ghost" onClick={ () => setEditing( null ) }>
							Cancel
						</button>
						<button className="btn btn--primary" onClick={ handleSave }>
							Save Client
						</button>
					</div>
				</div>
			) }

			<div className="card">
				<div className="card__heading-row">
					<h3 className="card__heading">
						{ clients.length } client{ clients.length !== 1 ? 's' : '' }
					</h3>
					<input
						className="search-input search-input--sm"
						type="search"
						placeholder="Search…"
						value={ search }
						onChange={ e => setSearch( e.target.value ) }
					/>
				</div>
				{ filtered.length > 0 ? (
					<table className="inv-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Added</th>
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
											title="Edit"
											onClick={ () => setEditing( { ...c } ) }
										>
											✏
										</button>
										<button
											className="action-btn action-btn--danger"
											title="Delete"
											onClick={ () => {
												if ( confirm( `Delete ${ c.name }?` ) ) {
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
							{ search ? 'No clients match.' : 'No clients yet. Add one above.' }
						</p>
					</div>
				) }
			</div>
		</div>
	);
}
