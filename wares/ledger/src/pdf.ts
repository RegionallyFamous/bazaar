import jsPDF                                                  from 'jspdf';
import type { Invoice, Client }                               from './types.ts';
import { invoiceSubtotal, invoiceTax, invoiceDiscount, invoiceTotal, fmtCurrency, fmtDate } from './types.ts';

export function exportInvoicePDF( invoice: Invoice, client: Client ): void {
	const doc = new jsPDF( { unit: 'mm', format: 'a4' } );
	const W   = 210;
	const M   = 20; // margin

	// Header band
	doc.setFillColor( 8, 145, 178 );     // #0891b2
	doc.rect( 0, 0, W, 38, 'F' );

	doc.setTextColor( 255, 255, 255 );
	doc.setFontSize( 22 );
	doc.setFont( 'helvetica', 'bold' );
	doc.text( 'INVOICE', M, 17 );

	doc.setFontSize( 11 );
	doc.setFont( 'helvetica', 'normal' );
	doc.text( `#${ invoice.number }`, M, 26 );

	const statusMap: Record<string, string> = {
		draft: 'DRAFT', sent: 'SENT', paid: '✓ PAID', overdue: 'OVERDUE',
	};
	doc.setFontSize( 10 );
	doc.text( statusMap[ invoice.status ] ?? invoice.status.toUpperCase(), W - M, 17, { align: 'right' } );

	// Reset text colour
	doc.setTextColor( 15, 23, 42 );

	// Dates
	doc.setFontSize( 10 );
	doc.setFont( 'helvetica', 'bold' );
	doc.text( 'Issue Date', W - 80, 52 );
	doc.text( 'Due Date',   W - 40, 52 );
	doc.setFont( 'helvetica', 'normal' );
	doc.text( fmtDate( invoice.issueDate ), W - 80, 58 );
	doc.text( fmtDate( invoice.dueDate ),   W - 40, 58 );

	// Bill To
	doc.setFontSize( 10 );
	doc.setFont( 'helvetica', 'bold' );
	doc.text( 'BILL TO', M, 52 );
	doc.setFont( 'helvetica', 'normal' );
	doc.text( client.name,  M, 58 );
	if ( client.email )   doc.text( client.email,   M, 64 );
	if ( client.address ) {
		const lines = doc.splitTextToSize( client.address, 80 ) as string[];
		doc.text( lines, M, client.email ? 70 : 64 );
	}

	// Line items table
	let y = 80;
	doc.setFillColor( 241, 245, 249 );
	doc.rect( M, y - 5, W - M * 2, 9, 'F' );

	doc.setFontSize( 9 );
	doc.setFont( 'helvetica', 'bold' );
	doc.setTextColor( 100, 116, 139 );
	doc.text( 'DESCRIPTION',              M + 2, y );
	doc.text( 'QTY',    W - 80, y, { align: 'right' } );
	doc.text( 'RATE',   W - 50, y, { align: 'right' } );
	doc.text( 'AMOUNT', W - M,  y, { align: 'right' } );

	y += 8;
	doc.setTextColor( 15, 23, 42 );
	doc.setFont( 'helvetica', 'normal' );
	doc.setFontSize( 10 );

	invoice.lineItems.forEach( ( item, idx ) => {
		if ( idx % 2 === 1 ) {
			doc.setFillColor( 248, 250, 252 );
			doc.rect( M, y - 5, W - M * 2, 8, 'F' );
		}
		const amount = item.qty * item.rate;
		const descLines = doc.splitTextToSize( item.description, 90 ) as string[];
		doc.text( descLines,                    M + 2, y );
		doc.text( String( item.qty ),           W - 80, y, { align: 'right' } );
		doc.text( fmtCurrency( item.rate ),     W - 50, y, { align: 'right' } );
		doc.text( fmtCurrency( amount ),        W - M,  y, { align: 'right' } );
		y += Math.max( 8, descLines.length * 5 );
	} );

	// Totals block
	y += 6;
	doc.setDrawColor( 226, 232, 240 );
	doc.line( W - 80, y, W - M, y );
	y += 7;

	doc.setFontSize( 10 );
	const sub = invoiceSubtotal( invoice );
	const tax = invoiceTax( invoice );
	const dis = invoiceDiscount( invoice );
	const tot = invoiceTotal( invoice );

	doc.text( 'Subtotal',                    W - 80, y );
	doc.text( fmtCurrency( sub ),            W - M, y, { align: 'right' } );
	y += 7;

	if ( invoice.taxPercent > 0 ) {
		doc.text( `Tax (${ invoice.taxPercent }%)`, W - 80, y );
		doc.text( fmtCurrency( tax ),               W - M, y, { align: 'right' } );
		y += 7;
	}

	if ( invoice.discountPercent > 0 ) {
		doc.text( `Discount (${ invoice.discountPercent }%)`, W - 80, y );
		doc.text( `−${ fmtCurrency( dis ) }`,                W - M, y, { align: 'right' } );
		y += 7;
	}

	doc.line( W - 80, y, W - M, y );
	y += 7;

	doc.setFont( 'helvetica', 'bold' );
	doc.setFontSize( 12 );
	doc.text( 'Total',              W - 80, y );
	doc.text( fmtCurrency( tot ),   W - M, y, { align: 'right' } );

	// Notes
	if ( invoice.notes ) {
		y += 16;
		doc.setFont( 'helvetica', 'bold' );
		doc.setFontSize( 10 );
		doc.text( 'Notes', M, y );
		y += 6;
		doc.setFont( 'helvetica', 'normal' );
		doc.setTextColor( 71, 85, 105 );
		const noteLines = doc.splitTextToSize( invoice.notes, W - M * 2 ) as string[];
		doc.text( noteLines, M, y );
	}

	const safeNumber = invoice.number.replace( /[/\\?%*:|"<>\x00-\x1F]/g, '-' );
	const filename   = safeNumber.endsWith( '.pdf' ) ? safeNumber : `${ safeNumber }.pdf`;
	doc.save( filename );
}
