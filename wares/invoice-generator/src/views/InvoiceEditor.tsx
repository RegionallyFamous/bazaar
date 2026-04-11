import { useState, useCallback }  from 'react';
import type { Invoice, Client, LineItem } from '../types.ts';
import { invoiceSubtotal, invoiceTax, invoiceDiscount, invoiceTotal, fmtCurrency } from '../types.ts';
import { exportInvoicePDF }       from '../pdf.ts';

interface Props {
	invoice:  Invoice;
	clients:  Client[];
	onSave:   ( inv: Invoice ) => void;
	onCancel: () => void;
}

function blankLine(): LineItem {
	return { description: '', qty: 1, rate: 0 };
}

export default function InvoiceEditor( { invoice, clients, onSave, onCancel }: Props ) {
	const [ form, setForm ] = useState<Invoice>( invoice );

	const setField = useCallback( <K extends keyof Invoice>( key: K, val: Invoice[K] ) => {
		setForm( f => ( { ...f, [ key ]: val } ) );
	}, [] );

	const setLine = useCallback( ( i: number, key: keyof LineItem, val: string | number ) => {
		setForm( f => {
			const lines = [ ...f.lineItems ];
			lines[ i ]  = { ...lines[ i ], [ key ]: val };
			return { ...f, lineItems: lines };
		} );
	}, [] );

	const addLine = useCallback( () => {
		setForm( f => ( { ...f, lineItems: [ ...f.lineItems, blankLine() ] } ) );
	}, [] );

	const removeLine = useCallback( ( i: number ) => {
		setForm( f => ( { ...f, lineItems: f.lineItems.filter( ( _, idx ) => idx !== i ) } ) );
	}, [] );

	const handleExport = useCallback( () => {
		const client = clients.find( c => c.id === form.clientId );
		if ( ! client ) { alert( 'Select a client first.' ); return; }
		exportInvoicePDF( form, client );
	}, [ form, clients ] );

	const subtotal  = invoiceSubtotal( form );
	const tax       = invoiceTax( form );
	const discount  = invoiceDiscount( form );
	const total     = invoiceTotal( form );
	const isNew     = ! invoice.createdAt;

	return (
		<div className="invoice-editor">
			<div className="view-header">
				<h2 className="view-title">
					{ isNew ? 'New Invoice' : `Edit ${ form.number }` }
				</h2>
				<div className="view-header__actions">
					{ ! isNew && (
						<button className="btn btn--ghost" onClick={ handleExport }>
							↓ Export PDF
						</button>
					) }
					<button className="btn btn--ghost" onClick={ onCancel }>
						Cancel
					</button>
					<button
						className="btn btn--primary"
						onClick={ () => onSave( form ) }
					>
						Save Invoice
					</button>
				</div>
			</div>

			<div className="editor-grid">
				{ /* Left column */ }
				<div className="editor-col">
					<div className="card">
						<h3 className="card__heading">Details</h3>
						<div className="field-group">
							<label className="field-label">Invoice Number</label>
							<input
								className="field-input"
								type="text"
								value={ form.number }
								onChange={ e => setField( 'number', e.target.value ) }
							/>
						</div>
						<div className="field-row">
							<div className="field-group">
								<label className="field-label">Issue Date</label>
								<input
									className="field-input"
									type="date"
									value={ form.issueDate }
									onChange={ e => setField( 'issueDate', e.target.value ) }
								/>
							</div>
							<div className="field-group">
								<label className="field-label">Due Date</label>
								<input
									className="field-input"
									type="date"
									value={ form.dueDate }
									onChange={ e => setField( 'dueDate', e.target.value ) }
								/>
							</div>
						</div>
						<div className="field-group">
							<label className="field-label">Client</label>
							<select
								className="field-input"
								value={ form.clientId }
								onChange={ e => setField( 'clientId', e.target.value ) }
							>
								<option value="">— Select client —</option>
								{ clients.map( c => (
									<option key={ c.id } value={ c.id }>{ c.name }</option>
								) ) }
							</select>
						</div>
						<div className="field-group">
							<label className="field-label">Status</label>
							<select
								className="field-input"
								value={ form.status }
								onChange={ e => setField( 'status', e.target.value as Invoice['status'] ) }
							>
								<option value="draft">Draft</option>
								<option value="sent">Sent</option>
								<option value="paid">Paid</option>
								<option value="overdue">Overdue</option>
							</select>
						</div>
					</div>

					<div className="card">
						<h3 className="card__heading">Notes</h3>
						<textarea
							className="field-input field-input--textarea"
							value={ form.notes }
							onChange={ e => setField( 'notes', e.target.value ) }
							placeholder="Payment terms, thank-you note…"
							rows={ 3 }
						/>
					</div>
				</div>

				{ /* Right column */ }
				<div className="editor-col editor-col--wide">
					<div className="card">
						<div className="card__heading-row">
							<h3 className="card__heading">Line Items</h3>
							<button className="btn btn--ghost btn--sm" onClick={ addLine }>
								+ Add item
							</button>
						</div>
						<table className="line-table">
							<thead>
								<tr>
									<th>Description</th>
									<th>Qty</th>
									<th>Rate</th>
									<th>Amount</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{ form.lineItems.map( ( line, i ) => (
									<tr key={ i }>
										<td>
											<input
												className="field-input field-input--inline"
												type="text"
												value={ line.description }
												placeholder="Item description"
												onChange={ e => setLine( i, 'description', e.target.value ) }
											/>
										</td>
										<td>
											<input
												className="field-input field-input--inline field-input--num"
												type="number"
												min="0"
												value={ line.qty }
												onChange={ e => setLine( i, 'qty', parseFloat( e.target.value ) || 0 ) }
											/>
										</td>
										<td>
											<input
												className="field-input field-input--inline field-input--num"
												type="number"
												min="0"
												step="0.01"
												value={ line.rate }
												onChange={ e => setLine( i, 'rate', parseFloat( e.target.value ) || 0 ) }
											/>
										</td>
										<td className="line-amount">
											{ fmtCurrency( line.qty * line.rate ) }
										</td>
										<td>
											{ form.lineItems.length > 1 && (
												<button
													className="action-btn action-btn--danger"
													onClick={ () => removeLine( i ) }
												>
													✕
												</button>
											) }
										</td>
									</tr>
								) ) }
							</tbody>
						</table>

						<div className="totals">
							<div className="totals__row">
								<span>Subtotal</span>
								<span>{ fmtCurrency( subtotal ) }</span>
							</div>
							<div className="totals__row">
								<label>
									Tax %
									<input
										className="totals__pct"
										type="number"
										min="0"
										max="100"
										value={ form.taxPercent }
										onChange={ e => setField( 'taxPercent', parseFloat( e.target.value ) || 0 ) }
									/>
								</label>
								<span>{ fmtCurrency( tax ) }</span>
							</div>
							<div className="totals__row">
								<label>
									Discount %
									<input
										className="totals__pct"
										type="number"
										min="0"
										max="100"
										value={ form.discountPercent }
										onChange={ e => setField( 'discountPercent', parseFloat( e.target.value ) || 0 ) }
									/>
								</label>
								<span>−{ fmtCurrency( discount ) }</span>
							</div>
							<div className="totals__row totals__row--total">
								<span>Total</span>
								<span>{ fmtCurrency( total ) }</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
