import { useState, useCallback, useRef } from 'react';
import { __, sprintf }                  from '@wordpress/i18n';
import type { Invoice, Client, LineItem } from '../types.ts';
import { invoiceSubtotal, invoiceTax, invoiceDiscount, invoiceTotal, fmtCurrency } from '../types.ts';
import { exportInvoicePDF }       from '../pdf.ts';

interface Props {
	invoice:  Invoice;
	isNew:    boolean;
	clients:  Client[];
	onSave:   ( inv: Invoice ) => void;
	onCancel: () => void;
}

function blankLine(): LineItem {
	return { id: crypto.randomUUID(), description: '', qty: 1, rate: 0 };
}

export default function InvoiceEditor( { invoice, isNew, clients, onSave, onCancel }: Props ) {
	const [ form, setForm ] = useState<Invoice>( () => ( {
		...invoice,
		lineItems: invoice.lineItems.map( li => ( li.id ? li : { ...li, id: crypto.randomUUID() } ) ),
	} ) );
	const [ clientError, setClientError ] = useState<string | null>( null );
	const clientSelectRef = useRef<HTMLSelectElement>( null );

	const setField = useCallback( <K extends keyof Invoice>( key: K, val: Invoice[K] ) => {
		setForm( f => ( { ...f, [ key ]: val } ) );
	}, [] );

	const setLine = useCallback( ( i: number, key: keyof LineItem, val: string | number ) => {
		setForm( f => {
			const lines = [ ...f.lineItems ];
			lines[ i ]  = { ...lines[ i ]!, [ key ]: val };
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
		if ( ! client ) {
			setClientError( __( 'Please select a client before exporting.', 'bazaar' ) );
			clientSelectRef.current?.focus();
			return;
		}
		setClientError( null );
		exportInvoicePDF( form, client );
	}, [ form, clients ] );

	const subtotal  = invoiceSubtotal( form );
	const tax       = invoiceTax( form );
	const discount  = invoiceDiscount( form );
	const total     = invoiceTotal( form );

	return (
		<div className="invoice-editor">
			<div className="view-header">
				<h2 className="view-title">
					{ isNew
						? __( 'New Invoice', 'bazaar' )
						: sprintf(
							/* translators: %s: invoice number */
							__( 'Edit %s', 'bazaar' ),
							form.number
						) }
				</h2>
				<div className="view-header__actions">
					{ ! isNew && (
						<button className="btn btn--ghost" onClick={ handleExport }>
							{ __( '↓ Export PDF', 'bazaar' ) }
						</button>
					) }
					<button className="btn btn--ghost" onClick={ onCancel }>
						{ __( 'Cancel', 'bazaar' ) }
					</button>
					<button
						className="btn btn--primary"
						onClick={ () => onSave( form ) }
					>
						{ __( 'Save Invoice', 'bazaar' ) }
					</button>
				</div>
			</div>

			<div className="editor-grid">
				{ /* Left column */ }
				<div className="editor-col">
					<div className="card">
						<h3 className="card__heading">{ __( 'Details', 'bazaar' ) }</h3>
						<div className="field-group">
							<label className="field-label">{ __( 'Invoice Number', 'bazaar' ) }</label>
							<input
								className="field-input"
								type="text"
								value={ form.number }
								onChange={ e => setField( 'number', e.target.value ) }
							/>
						</div>
						<div className="field-row">
							<div className="field-group">
								<label className="field-label">{ __( 'Issue Date', 'bazaar' ) }</label>
								<input
									className="field-input"
									type="date"
									value={ form.issueDate }
									onChange={ e => setField( 'issueDate', e.target.value ) }
								/>
							</div>
							<div className="field-group">
								<label className="field-label">{ __( 'Due Date', 'bazaar' ) }</label>
								<input
									className="field-input"
									type="date"
									value={ form.dueDate }
									onChange={ e => setField( 'dueDate', e.target.value ) }
								/>
							</div>
						</div>
					<div className="field-group">
						<label className="field-label">{ __( 'Client', 'bazaar' ) }</label>
						<select
							ref={ clientSelectRef }
							className="field-input"
							value={ form.clientId }
							onChange={ e => { setField( 'clientId', e.target.value ); setClientError( null ); } }
						>
							<option value="">{ __( '— Select client —', 'bazaar' ) }</option>
							{ clients.map( c => (
								<option key={ c.id } value={ c.id }>{ c.name }</option>
							) ) }
						</select>
						{ clientError && (
							<p className="field-error" role="alert">{ clientError }</p>
						) }
					</div>
						<div className="field-group">
							<label className="field-label">{ __( 'Status', 'bazaar' ) }</label>
							<select
								className="field-input"
								value={ form.status }
								onChange={ e => setField( 'status', e.target.value as Invoice['status'] ) }
							>
								<option value="draft">{ __( 'Draft', 'bazaar' ) }</option>
								<option value="sent">{ __( 'Sent', 'bazaar' ) }</option>
								<option value="paid">{ __( 'Paid', 'bazaar' ) }</option>
								<option value="overdue">{ __( 'Overdue', 'bazaar' ) }</option>
							</select>
						</div>
					</div>

					<div className="card">
						<h3 className="card__heading">{ __( 'Notes', 'bazaar' ) }</h3>
						<textarea
							className="field-input field-input--textarea"
							value={ form.notes }
							onChange={ e => setField( 'notes', e.target.value ) }
							placeholder={ __( 'Payment terms, thank-you note…', 'bazaar' ) }
							rows={ 3 }
						/>
					</div>
				</div>

				{ /* Right column */ }
				<div className="editor-col editor-col--wide">
					<div className="card">
						<div className="card__heading-row">
							<h3 className="card__heading">{ __( 'Line Items', 'bazaar' ) }</h3>
							<button className="btn btn--ghost btn--sm" onClick={ addLine }>
								{ __( '+ Add item', 'bazaar' ) }
							</button>
						</div>
						<table className="line-table">
							<thead>
								<tr>
									<th>{ __( 'Description', 'bazaar' ) }</th>
									<th>{ __( 'Qty', 'bazaar' ) }</th>
									<th>{ __( 'Rate', 'bazaar' ) }</th>
									<th>{ __( 'Amount', 'bazaar' ) }</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
						{ form.lineItems.map( ( line, i ) => (
								<tr key={ line.id ?? `line-${ i }` }>
										<td>
											<input
												className="field-input field-input--inline"
												type="text"
												value={ line.description }
												placeholder={ __( 'Item description', 'bazaar' ) }
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
													aria-label={ __( 'Remove line item', 'bazaar' ) }
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
								<span>{ __( 'Subtotal', 'bazaar' ) }</span>
								<span>{ fmtCurrency( subtotal ) }</span>
							</div>
							<div className="totals__row">
								<label>
									{ __( 'Tax %', 'bazaar' ) }
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
									{ __( 'Discount %', 'bazaar' ) }
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
								<span>{ __( 'Total', 'bazaar' ) }</span>
								<span>{ fmtCurrency( total ) }</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
