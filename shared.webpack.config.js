//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

'use strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const merge = require('merge-options');

/**
 * Add default webpack options to a set of options.
 * 
 * @param {WebpackConfig} extConfig Extra configuration options.
 * @param {boolean} forWeb True for web extension options; false for node extension options.
 * @returns Merged options.
 */
function withDefaults(/**@type WebpackConfig*/extConfig, /**@type boolean*/forWeb) {

	/** @type WebpackConfig */
	const defaultConfig = {
		mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
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

	/** @type WebpackConfig */
	const defaultNodeConfig = {
		target: 'node', // extensions run in a node context
		node: {
			__dirname: false // leave the __dirname-behaviour intact
		},
		resolve: {
			mainFields: ['module', 'main'],
			extensions: ['.ts', '.js'] // support ts-files and js-files
		}
	};

	/** @type WebpackConfig */
	const defaultWebConfig = {
		target: 'webworker',
		resolve: {
			mainFields: ['browser', 'module', 'main'],
			extensions: ['.ts', '.js'], // support ts-files and js-files
			fallback: {
				"path": require.resolve("path-browserify"),
			}
		},
	};

	return merge(
		defaultConfig,
		forWeb ? defaultWebConfig : defaultNodeConfig,
		extConfig
	);
}

module.exports = { withDefaults };
