//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

'use strict';

const merge = require('merge-options');

function withDefaults(/**@type WebpackConfig*/extConfig) {

	/** @type WebpackConfig */
	const defaultConfig = {
		mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
		target: 'node', // extensions run in a node context
		node: {
			__dirname: false // leave the __dirname-behaviour intact
		},
		resolve: {
			mainFields: ['module', 'main'],
			extensions: ['.ts', '.js'] // support ts-files and js-files
		},
		module: {
			rules: [{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [{
					// configure TypeScript loader:
					// * enable sources maps for end-to-end source maps
					loader: 'ts-loader',
					options: {
						compilerOptions: {
							"sourceMap": true,
						}
					}
				}]
			}]
		},
		externals: {
			'vscode': 'commonjs vscode', // ignored because it doesn't exist
		},
		// yes, really source maps
		devtool: 'source-map'
	};

	return merge(defaultConfig, extConfig);
}

function withDefaultsWeb(/**@type WebpackConfig*/extConfig) {

	/** @type WebpackConfig */
	const webConfig = {
		mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
		target: 'webworker',
		resolve: {
			mainFields: ['browser', 'module', 'main'],
			extensions: ['.ts', '.js'], // support ts-files and js-files
			fallback: {
				"path": require.resolve("path-browserify"),
			}
		},
		module: {
			rules: [{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [{
					// configure TypeScript loader:
					// * enable sources maps for end-to-end source maps
					loader: 'ts-loader',
					options: {
						compilerOptions: {
							"sourceMap": true,
						}
					}
				}]
			}]
		},
		externals: {
			'vscode': 'commonjs vscode', // ignored because it doesn't exist
		},
		// yes, really source maps
		devtool: 'source-map'
	};

	return merge(webConfig, extConfig);
}

module.exports = {
	withDefaults,
	withDefaultsWeb
};
