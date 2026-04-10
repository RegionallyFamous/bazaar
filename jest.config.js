module.exports = {
	testEnvironment: 'jsdom',
	testMatch: [ '**/tests/js/**/*.test.js' ],
	transform: {
		'^.+\\.js$': 'babel-jest',
	},
	moduleNameMapper: {
		'@wordpress/api-fetch': '<rootDir>/tests/js/__mocks__/@wordpress/api-fetch.js',
		'@wordpress/i18n': '<rootDir>/tests/js/__mocks__/@wordpress/i18n.js',
	},
};
