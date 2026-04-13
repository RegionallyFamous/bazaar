export interface Client {
	id:        string;
	name:      string;
	email:     string;
	address:   string;
	notes:     string;
	createdAt: string;
	/** Transient flag set by newClient(); stripped before persisting. */
	_isNew?:   boolean;
}

export interface LineItem {
	/** Stable identity used as React key; optional for backwards-compat with stored data. */
	id?:         string;
	description: string;
	qty:         number;
	rate:        number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
	id:              string;
	number:          string;
	clientId:        string;
	status:          InvoiceStatus;
	lineItems:       LineItem[];
	taxPercent:      number;
	discountPercent: number;
	issueDate:       string;
	dueDate:         string;
	notes:           string;
	createdAt:       string;
	/** Transient flag set by newInvoice(); stripped before persisting. */
	_isNew?:         boolean;
}

export function invoiceSubtotal( inv: Invoice ): number {
	return inv.lineItems.reduce( ( s, li ) => s + li.qty * li.rate, 0 );
}

export function invoiceTax( inv: Invoice ): number {
	return invoiceSubtotal( inv ) * inv.taxPercent / 100;
}

export function invoiceDiscount( inv: Invoice ): number {
	return invoiceSubtotal( inv ) * inv.discountPercent / 100;
}

export function invoiceTotal( inv: Invoice ): number {
	return invoiceSubtotal( inv ) + invoiceTax( inv ) - invoiceDiscount( inv );
}

export function fmtCurrency( n: number ): string {
	return new Intl.NumberFormat( 'en-US', { style: 'currency', currency: 'USD' } ).format( n );
}

export function fmtDate( iso: string ): string {
	if ( ! iso ) return '—';
	return new Date( iso + 'T00:00:00' ).toLocaleDateString( 'en-US', {
		year: 'numeric', month: 'short', day: 'numeric',
	} );
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
	draft:   'Draft',
	sent:    'Sent',
	paid:    'Paid',
	overdue: 'Overdue',
};

export type View = 'dashboard' | 'invoices' | 'new-invoice' | 'edit-invoice' | 'clients';
