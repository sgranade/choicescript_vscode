//@ts-check

'use strict';

const { withDefaults, withDefaultsWeb } = require('../shared.webpack.config');
const path = require('path');

const nodeConfig = withDefaults({
	entry: {
		extension: './client/src/node/extension.ts',
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist/node'),
		libraryTarget: "commonjs"
	},
});

const webConfig = withDefaultsWeb({
	context: path.join(__dirname),
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
	target: 'webworker', // extensions run in a webworker context
	entry: {
		extension: './src/web/extension.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist/web'),
		libraryTarget: 'commonjs',
		devtoolModuleFilenameTemplate: '[absolute-resource-path]'
	}
});

module.exports = [nodeConfig, webConfig];
