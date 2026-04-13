import { useMemo }                from 'react';
import type { Invoice, Client, InvoiceStatus }  from '../types.ts';
import { invoiceTotal, fmtCurrency } from '../types.ts';
import type { View }             from '../types.ts';

function displayStatus( inv: Invoice ): InvoiceStatus {
	if ( inv.status === 'sent' && inv.dueDate && new Date( inv.dueDate + 'T00:00:00' ) < new Date() ) {
		return 'overdue';
	}
	return inv.status;
}

interface Props {
	invoices: Invoice[];
	clients:  Client[];
	onNavigate: ( view: View, invoiceId?: string ) => void;
}

export default function Dashboard( { invoices, clients, onNavigate }: Props ) {
	const stats = useMemo( () => {
		const total     = invoices.reduce( ( s, i ) => s + invoiceTotal( i ), 0 );
		const paid      = invoices.filter( i => i.status === 'paid' ).reduce( ( s, i ) => s + invoiceTotal( i ), 0 );
		const outstanding = invoices
			.filter( i => i.status === 'sent' || i.status === 'overdue' )
			.reduce( ( s, i ) => s + invoiceTotal( i ), 0 );
		const overdue   = invoices.filter( i => i.status === 'overdue' ).length;
		return { total, paid, outstanding, overdue };
	}, [ invoices ] );

	const recent = useMemo( () =>
		[ ...invoices ]
			.sort( ( a, b ) => b.createdAt.localeCompare( a.createdAt ) )
			.slice( 0, 5 ),
	[ invoices ] );

	return (
		<div className="dashboard">
			<div className="view-header">
				<h2 className="view-title">Dashboard</h2>
				<button
					className="btn btn--primary"
					onClick={ () => onNavigate( 'new-invoice' ) }
				>
					+ New Invoice
				</button>
			</div>

			<div className="stat-grid">
				<div className="stat-card">
					<span className="stat-card__label">Total Invoiced</span>
					<span className="stat-card__value">{ fmtCurrency( stats.total ) }</span>
				</div>
				<div className="stat-card stat-card--green">
					<span className="stat-card__label">Collected</span>
					<span className="stat-card__value">{ fmtCurrency( stats.paid ) }</span>
				</div>
				<div className="stat-card stat-card--amber">
					<span className="stat-card__label">Outstanding</span>
					<span className="stat-card__value">{ fmtCurrency( stats.outstanding ) }</span>
				</div>
				<div className={ `stat-card${ stats.overdue > 0 ? ' stat-card--red' : '' }` }>
					<span className="stat-card__label">Overdue</span>
					<span className="stat-card__value">{ stats.overdue }</span>
				</div>
			</div>

			{ recent.length > 0 && (
				<section className="card">
					<h3 className="card__heading">Recent Invoices</h3>
					<table className="inv-table">
						<thead>
						<tr>
							<th>Invoice</th>
							<th>Client</th>
							<th>Created</th>
							<th>Amount</th>
							<th>Status</th>
						</tr>
						</thead>
						<tbody>
							{ recent.map( inv => {
								const client = clients.find( c => c.id === inv.clientId );
								return (
									<tr
										key={ inv.id }
										className="inv-table__row"
										onClick={ () => onNavigate( 'edit-invoice', inv.id ) }
									>
										<td className="inv-table__num">{ inv.number }</td>
										<td>{ client?.name ?? '—' }</td>
										<td className="inv-table__muted">
											{ new Date( inv.createdAt ).toLocaleDateString() }
										</td>
										<td>{ fmtCurrency( invoiceTotal( inv ) ) }</td>
									<td>
										<span className={ `status-badge status-badge--${ displayStatus( inv ) }` }>
											{ displayStatus( inv ) }
										</span>
									</td>
									</tr>
								);
							} ) }
						</tbody>
					</table>
				</section>
			) }

			{ invoices.length === 0 && (
				<div className="empty-state">
					<p className="empty-state__text">No invoices yet.</p>
					<button
						className="btn btn--primary"
						onClick={ () => onNavigate( 'new-invoice' ) }
					>
						Create your first invoice
					</button>
				</div>
			) }

			{ clients.length === 0 && invoices.length === 0 && (
				<div className="tip">
					<strong>Tip:</strong> Add a client first, then create invoices for them.{' '}
					<button className="tip__link" onClick={ () => onNavigate( 'clients' ) }>
						Manage clients →
					</button>
				</div>
			) }
		</div>
	);
}
