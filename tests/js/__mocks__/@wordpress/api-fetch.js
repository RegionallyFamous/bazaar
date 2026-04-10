const apiFetch = jest.fn( () => Promise.resolve( {} ) );
apiFetch.use = jest.fn();
apiFetch.createNonceMiddleware = jest.fn( () => jest.fn() );
apiFetch.createRootURLMiddleware = jest.fn( () => jest.fn() );
module.exports = apiFetch;
