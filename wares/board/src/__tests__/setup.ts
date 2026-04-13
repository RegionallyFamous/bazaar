import '@testing-library/jest-dom';

// jsdom 26 in some Vitest environments exposes localStorage without standard
// Storage methods. Provide a reliable in-memory implementation.
const _store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem:    ( key ) => Object.prototype.hasOwnProperty.call( _store, key ) ? ( _store[ key ] ?? null ) : null,
  setItem:    ( key, value ) => { _store[ key ] = String( value ); },
  removeItem: ( key ) => { delete _store[ key ]; },
  clear:      () => { for ( const k in _store ) delete _store[ k ]; },
  key:        ( index ) => Object.keys( _store )[ index ] ?? null,
  get length() { return Object.keys( _store ).length; },
};

Object.defineProperty( globalThis, 'localStorage', {
  value:        localStorageMock,
  writable:     true,
  configurable: true,
} );
