module.exports = {
	testEnvironment: 'jsdom',
	testMatch: [ '**/tests/js/**/*.test.{js,ts,tsx}' ],
	transform: {
		'^.+\\.[jt]sx?$': 'babel-jest',
	},
	moduleNameMapper: {
		'\\.css$': '<rootDir>/tests/js/__mocks__/style.js',
		'@wordpress/api-fetch': '<rootDir>/tests/js/__mocks__/@wordpress/api-fetch.js',
		'@wordpress/i18n': '<rootDir>/tests/js/__mocks__/@wordpress/i18n.js',
	},
	setupFilesAfterEnv: [ '@testing-library/jest-dom' ],
	// Use V8's built-in coverage instead of Babel/Istanbul instrumentation.
	// This avoids the minimatch v10 API incompatibility in test-exclude/babel-plugin-istanbul.
	coverageProvider: 'v8',
	coverageThreshold: {
		global: { lines: 79, branches: 70, functions: 75 },
	},
};
