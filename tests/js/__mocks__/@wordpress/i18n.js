module.exports = {
	__: ( str ) => str,
	_n: ( single, plural, count ) => ( count === 1 ? single : plural ),
	sprintf: ( fmt, ...args ) => {
		let i = 0;
		return fmt.replace( /%s|%d|%\d+\$s|%\d+\$d/g, () => args[ i++ ] ?? '' );
	},
};
