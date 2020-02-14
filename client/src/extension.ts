
import * as path from 'path';
import { ExtensionContext, commands, Selection, TextEditor } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';

let client: LanguageClient;

/**
 * Surround the current selection with bbcode delimiters like [i] and [/i].
 * @param editor Current editor.
 * @param delimitCharacters Characters inside the bbcode [], such as "i" or "b"
 */
function bbcodeDelimit(editor: TextEditor, delimitCharacters: string) {
	if (!editor) {
		return;
	}

	let open = `[${delimitCharacters}]`;
	let close = `[/${delimitCharacters}]`;
	let document = editor.document;
	let selection = editor.selection;
	if (selection.isEmpty) {
		editor.edit(edit => edit.insert(selection.start, `${open}${close}`)).then(x => {
			let newStartIndex = document.offsetAt(editor.selection.start) - close.length;
			editor.selection = new Selection(
				document.positionAt(newStartIndex),
				document.positionAt(newStartIndex)
			);
		});
	}
	else {
		let word = document.getText(selection);
		editor.edit(edit => edit.replace(selection, `${open}${word}${close}`)).then(x => {
			let newStartIndex = document.offsetAt(editor.selection.start) + open.length;
			let newEndIndex = document.offsetAt(editor.selection.end) - close.length;
			editor.selection = new Selection(
				document.positionAt(newStartIndex),
				document.positionAt(newEndIndex)
			);
		});
	}
}

export function activate(context: ExtensionContext) {
	// Register our commands
	const italicsCommandRegistration = commands.registerTextEditorCommand(
		'choicescript.italicize', (editor) => {
			bbcodeDelimit(editor, "i");
	});
	const boldCommandRegistration = commands.registerTextEditorCommand(
		'choicescript.bold', (editor) => {
			bbcodeDelimit(editor, "b");
	});

	context.subscriptions.push(italicsCommandRegistration, boldCommandRegistration);

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'choicescript' }]
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'choicescriptVsCode',
		'ChoiceScript VSCode',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
