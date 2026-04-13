import { describe, it, expect } from 'vitest';
import type { Invoice } from '../types.ts';
import {
  invoiceSubtotal,
  invoiceTax,
  invoiceDiscount,
  invoiceTotal,
  fmtCurrency,
  fmtDate,
  STATUS_LABEL,
} from '../types.ts';

function makeInvoice( overrides: Partial<Invoice> = {} ): Invoice {
  return {
    id:              'test-id',
    number:          'INV-001',
    clientId:        'client-1',
    status:          'draft',
    lineItems:       [
      { id: 'li-1', description: 'Service A', qty: 2, rate: 50 },
      { id: 'li-2', description: 'Service B', qty: 1, rate: 100 },
    ],
    taxPercent:      10,
    discountPercent: 5,
    issueDate:       '2024-01-01',
    dueDate:         '2024-01-31',
    notes:           '',
    createdAt:       '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe( 'invoiceSubtotal', () => {
  it( 'sums qty × rate for all line items', () => {
    const inv = makeInvoice();
    // 2*50 + 1*100 = 200
    expect( invoiceSubtotal( inv ) ).toBe( 200 );
  } );

  it( 'returns 0 for empty line items', () => {
    const inv = makeInvoice( { lineItems: [] } );
    expect( invoiceSubtotal( inv ) ).toBe( 0 );
  } );
} );

describe( 'invoiceTax', () => {
  it( 'calculates subtotal × taxPercent / 100', () => {
    const inv = makeInvoice( { taxPercent: 10 } );
    // subtotal=200, tax=200*10/100=20
    expect( invoiceTax( inv ) ).toBe( 20 );
  } );

  it( 'returns 0 when taxPercent is 0', () => {
    const inv = makeInvoice( { taxPercent: 0 } );
    expect( invoiceTax( inv ) ).toBe( 0 );
  } );
} );

describe( 'invoiceDiscount', () => {
  it( 'calculates subtotal × discountPercent / 100', () => {
    const inv = makeInvoice( { discountPercent: 5 } );
    // subtotal=200, discount=200*5/100=10
    expect( invoiceDiscount( inv ) ).toBe( 10 );
  } );
} );

describe( 'invoiceTotal', () => {
  it( 'calculates subtotal + tax - discount', () => {
    const inv = makeInvoice( { taxPercent: 10, discountPercent: 5 } );
    // subtotal=200, tax=20, discount=10, total=210
    expect( invoiceTotal( inv ) ).toBe( 210 );
  } );

  it( 'matches manual calculation for a multi-item invoice with tax and discount', () => {
    const inv = makeInvoice( {
      lineItems: [
        { id: 'a', description: 'Widget', qty: 3, rate: 40 },
        { id: 'b', description: 'Service', qty: 2, rate: 75 },
        { id: 'c', description: 'Support', qty: 1, rate: 30 },
      ],
      taxPercent:      8,
      discountPercent: 15,
    } );
    const subtotal = 3 * 40 + 2 * 75 + 1 * 30; // 120 + 150 + 30 = 300
    const tax      = subtotal * 8 / 100;         // 24
    const discount = subtotal * 15 / 100;        // 45
    const total    = subtotal + tax - discount;  // 279
    expect( invoiceSubtotal( inv ) ).toBe( subtotal );
    expect( invoiceTotal( inv ) ).toBeCloseTo( total );
  } );
} );

describe( 'fmtCurrency', () => {
  it( 'formats 0 as $0.00', () => {
    expect( fmtCurrency( 0 ) ).toBe( '$0.00' );
  } );

  it( 'formats 1234.56 as $1,234.56', () => {
    expect( fmtCurrency( 1234.56 ) ).toBe( '$1,234.56' );
  } );
} );

describe( 'fmtDate', () => {
  it( 'returns an em-dash for empty string', () => {
    expect( fmtDate( '' ) ).toBe( '—' );
  } );

  it( 'returns a human-readable date containing the month abbreviation and year', () => {
    const result = fmtDate( '2024-01-15' );
    expect( result ).toContain( 'Jan' );
    expect( result ).toContain( '2024' );
  } );
} );

describe( 'STATUS_LABEL', () => {
  it( 'has entries for all 4 statuses', () => {
    expect( STATUS_LABEL.draft ).toBeDefined();
    expect( STATUS_LABEL.sent ).toBeDefined();
    expect( STATUS_LABEL.paid ).toBeDefined();
    expect( STATUS_LABEL.overdue ).toBeDefined();
  } );
} );
