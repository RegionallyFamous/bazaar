import { useState, useMemo }      from 'react';
import type { Invoice, Client, InvoiceStatus } from '../types.ts';
import { invoiceTotal, fmtCurrency, fmtDate, STATUS_LABEL } from '../types.ts';
import type { View } from '../types.ts';

function displayStatus( inv: Invoice ): InvoiceStatus {
	if ( inv.status === 'sent' && inv.dueDate && new Date( inv.dueDate + 'T00:00:00' ) < new Date() ) {
		return 'overdue';
	}
	return inv.status;
}

interface Props {
	invoices:       Invoice[];
	clients:        Client[];
	onNavigate:     ( view: View, invoiceId?: string ) => void;
	onDeleteInvoice:( id: string ) => void;
	onStatusChange: ( id: string, status: InvoiceStatus ) => void;
}

const ALL_STATUSES: ( InvoiceStatus | 'all' )[] = [ 'all', 'draft', 'sent', 'paid', 'overdue' ];

export default function InvoiceList( {
	invoices, clients, onNavigate, onDeleteInvoice, onStatusChange,
}: Props ) {
	const [ filter, setFilter ]   = useState<InvoiceStatus | 'all'>( 'all' );
	const [ search, setSearch ]   = useState( '' );

	const filtered = useMemo( () => {
		let list = [ ...invoices ].sort( ( a, b ) => b.createdAt.localeCompare( a.createdAt ) );
		if ( filter !== 'all' ) list = list.filter( i => displayStatus( i ) === filter );
		if ( search ) {
			const q = search.toLowerCase();
			list = list.filter( i => {
				const client = clients.find( c => c.id === i.clientId );
				return i.number.toLowerCase().includes( q ) || client?.name.toLowerCase().includes( q );
			} );
		}
		return list;
	}, [ invoices, clients, filter, search ] );

	return (
		<div className="invoice-list">
			<div className="view-header">
				<h2 className="view-title">Invoices</h2>
				<button
					className="btn btn--primary"
					onClick={ () => onNavigate( 'new-invoice' ) }
				>
					+ New Invoice
				</button>
			</div>

			<div className="filters">
				<div className="filter-tabs">
				{ ALL_STATUSES.map( s => (
					<button
						key={ s }
						className={ `filter-tab${ filter === s ? ' filter-tab--active' : '' }` }
						aria-pressed={ filter === s }
						onClick={ () => setFilter( s ) }
					>
						{ s === 'all' ? 'All' : STATUS_LABEL[ s ] }
						<span className="filter-tab__count">
							{ s === 'all'
								? invoices.length
								: invoices.filter( i => displayStatus( i ) === s ).length }
						</span>
					</button>
				) ) }
				</div>
			<input
				className="search-input"
				type="search"
				placeholder="Search invoices…"
				aria-label="Search invoices"
				value={ search }
				onChange={ e => setSearch( e.target.value ) }
			/>
			</div>

			{ filtered.length > 0 ? (
				<div className="card">
					<table className="inv-table">
						<thead>
							<tr>
								<th>Invoice</th>
								<th>Client</th>
								<th>Issue Date</th>
								<th>Due Date</th>
								<th>Amount</th>
								<th>Status</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{ filtered.map( inv => {
								const client = clients.find( c => c.id === inv.clientId );
								return (
									<tr key={ inv.id } className="inv-table__row">
										<td className="inv-table__num">{ inv.number }</td>
										<td>{ client?.name ?? '—' }</td>
										<td className="inv-table__muted">{ fmtDate( inv.issueDate ) }</td>
										<td className="inv-table__muted">{ fmtDate( inv.dueDate ) }</td>
										<td>{ fmtCurrency( invoiceTotal( inv ) ) }</td>
										<td>
									<select
											className={ `status-select status-select--${ displayStatus( inv ) }` }
											value={ inv.status }
											onChange={ e => onStatusChange( inv.id, e.target.value as InvoiceStatus ) }
										>
												{ ( [ 'draft', 'sent', 'paid', 'overdue' ] as InvoiceStatus[] ).map( s => (
													<option key={ s } value={ s }>{ STATUS_LABEL[ s ] }</option>
												) ) }
											</select>
										</td>
										<td className="inv-table__actions">
											<button
												className="action-btn"
												title="Edit"
												onClick={ () => onNavigate( 'edit-invoice', inv.id ) }
											>
												✏
											</button>
											<button
												className="action-btn action-btn--danger"
												title="Delete"
												onClick={ () => {
													if ( confirm( `Delete ${ inv.number }?` ) ) {
														onDeleteInvoice( inv.id );
													}
												} }
											>
												✕
											</button>
										</td>
									</tr>
								);
							} ) }
						</tbody>
					</table>
				</div>
			) : (
				<div className="empty-state">
					<p className="empty-state__text">
						{ search || filter !== 'all'
							? 'No invoices match your filters.'
							: 'No invoices yet.' }
					</p>
				</div>
			) }
		</div>
	);
}
