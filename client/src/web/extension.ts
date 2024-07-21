import * as vscode from 'vscode';
import { type BaseLanguageClient, LanguageClient, type LanguageClientOptions } from 'vscode-languageclient/browser';
import { startClient } from '../common/client';

let client: BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {
	const serverFile = `${context.extensionUri}/server/dist/web/server.js`;

	try {
		const serverWorker = new Worker(serverFile);

		const clientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => {
			return new LanguageClient(id, name, clientOptions, serverWorker);
		};

		console.log('Activating a ChoiceScript Language client in a web extension host context');
		client = await startClient(context, clientConstructor);
	} catch (err) {
		console.log(err);
		vscode.window.showErrorMessage(err.message);
	}
}

export async function deactivate() {
	if (client) {
		await client.stop();
		client = undefined;
	}
}
