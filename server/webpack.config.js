//@ts-check

'use strict';

const { withDefaults, withDefaultsWeb } = require('../shared.webpack.config');
const path = require('path');

const nodeConfig = withDefaults({
	entry: {
		server: './server/src/node/server.ts',
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist/node')
	}
});

const webConfig = withDefaultsWeb({
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
	target: 'webworker', // extensions run in a webworker context
	entry: {
		server: './server/src/web/server.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist/web'),
		libraryTarget: 'var',
		library: 'serverExportVar',
		devtoolModuleFilenameTemplate: '[absolute-resource-path]'
	}
});

module.exports = [nodeConfig, webConfig];
