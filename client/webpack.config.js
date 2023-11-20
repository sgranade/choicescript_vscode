//@ts-check

'use strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withDefaults } = require('../shared.webpack.config');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const nodeConfig = withDefaults({
	context: path.join(__dirname),
	entry: {
		extension: './src/node/extension.ts',
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist/node'),
		libraryTarget: "commonjs"
	},
}, false);

const webConfig = withDefaults({
	context: path.join(__dirname),
	entry: {
		extension: './src/web/extension.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist/web'),
		libraryTarget: 'commonjs',
		devtoolModuleFilenameTemplate: '[absolute-resource-path]'
	}
}, true);

module.exports = [nodeConfig, webConfig];
