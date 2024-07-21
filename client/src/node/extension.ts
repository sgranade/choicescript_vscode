import type { ExtensionContext } from 'vscode';
import { RelativePaths } from '../common/constants';
import { type BaseLanguageClient, LanguageClient, type LanguageClientOptions, type ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { type LanguageClientConstructor, startClient } from '../common/client';
import * as testFunctionality from './cstests';
import type { ChoiceScriptTestProvider } from '../common/choicescript-test-service';

let client: BaseLanguageClient | undefined;

export async function activate(context: ExtensionContext) {
	const serverModule = context.asAbsolutePath(
		RelativePaths.VSCodeExtensionServer
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const DEBUG_PORT = 6009; 
	const debugOptions = { execArgv: ['--nolazy', process.env['DEBUG_WAIT_FOR_SERVER'] ? `--inspect-brk=${DEBUG_PORT}` : `--inspect=${DEBUG_PORT}`] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	const clientConstructor: LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => {
		return new LanguageClient(id, name, serverOptions, clientOptions);
	};

	const testProvider: ChoiceScriptTestProvider = {
		...testFunctionality
	};
	
	console.log('Activating a ChoiceScript Language client in a node extension host context');
	client = await startClient(context, clientConstructor, testProvider);
}

export async function deactivate() {
	if (client) {
		await client.stop();
		client = undefined;
	}
}
