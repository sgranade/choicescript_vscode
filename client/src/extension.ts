import * as path from 'path';
import { ExtensionContext, commands, Selection, TextEditor, StatusBarItem, StatusBarAlignment, Disposable, window, TextEditorSelectionChangeEvent } from 'vscode';
import * as URI from 'urijs';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	Location,
	Range,
	TransportKind
} from 'vscode-languageclient/node';

/**
 * Server message about an updated word count in a document.
 */
interface UpdatedWordCount {
	/**
	 * Document URI.
	 */
	uri: string;
	/**
	 * New word count, or undefined if it has none.
	 */
	count?: number;
}

let client: LanguageClient;

/**
 * Status bar item that shows word count.
 */
export class WordCountBar {
	private _statusBarItem: StatusBarItem;
	private _wordCount: number | undefined;
	private _selectionCount: number | undefined;

	constructor() {
		this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1000);
	}

	public showOrHide(editor: TextEditor | undefined): void {
		if (editor === undefined) {
			this._statusBarItem.hide();
		}
		else {
			const doc = editor.document;

			if (doc.languageId === "choicescript") {
				this._updateText();
				this._statusBarItem.show();
			}
			else {
				this._statusBarItem.hide();
			}
		}
	}

	private _updateText(): void {
		let text = "$(pencil) ";
		if (this._wordCount === undefined) {
			text += "counting words";
		}
		else {
			text += `${this._wordCount} word`;

			if (this._wordCount != 1) {
				text += "s";
			}
			if (this._selectionCount !== undefined) {
				text += ` (${this._selectionCount} selected)`;
			}
		}

		this._statusBarItem.text = text;
	}

	public updateWordCount(wordCount: number | undefined = undefined): void {
		this._wordCount = wordCount;
		this._updateText();
	}

	public updateSelectionCount(selectionCount: number | undefined = undefined): void {
		this._selectionCount = selectionCount;
		this._updateText();
	}

	public dispose(): void {
		this._statusBarItem.dispose();
	}
}

/**
 * Controller for the word count status bar item.
 */
class WordCountController {
	private _wordCountBar: WordCountBar;
	private _disposable: Disposable;

	constructor(wordCountBar: WordCountBar, client: LanguageClient) {
		this._wordCountBar = wordCountBar;
		this._wordCountBar.updateWordCount();

		// Subscribe to selection change & editor activation
		const disposables: Disposable[] = [];
		window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, disposables);
		window.onDidChangeTextEditorSelection(this._onDidChangeTextEditorSelection, this, disposables);

		// Subscribe to word count updates from the CS language server
		client.onReady().then(() => {
			disposables.push(client.onNotification("choicescript/updatedwordcount", this._onUpdatedWordCount));
			this._disposable = Disposable.from(...disposables);
		});
	}

	// This is an instance function so we can properly capture "this" b/c of how it's called
	private _onUpdatedWordCount = (e: UpdatedWordCount): void => {
		const editor = window.activeTextEditor;

		if (editor === undefined) {
			return;
		}

		const editorUri = URI(editor.document.uri.toString()).normalize();
		const updatedUri = URI(e.uri).normalize();
		if (editorUri.equals(updatedUri)) {
			this._wordCountBar.showOrHide(editor);
			this._wordCountBar.updateWordCount(e.count);
		}
	}

	private _onDidChangeActiveTextEditor(e: TextEditor): void {
		this._wordCountBar.showOrHide(e);
		client.sendRequest("custom/wordcount", e.document.uri.toString()).then((count: number | null) => {
			count = (count === null) ? undefined : count;
			this._wordCountBar.updateWordCount(count);
		});
	}

	private _onDidChangeTextEditorSelection(e: TextEditorSelectionChangeEvent): void {
		const location = Location.create(
			e.textEditor.document.uri.toString(),
			Range.create(e.selections[0].start, e.selections[0].end)
		);
		client.sendRequest("custom/selectionwordcount", location).then(
			(count: number | null) => {
				count = (count === null) ? undefined : count;
				this._wordCountBar.updateSelectionCount(count);
			}
		);
	}

	public dispose(): void {
		this._disposable.dispose();
	}
}

/**
 * Surround the current selection with bbcode delimiters like [i] and [/i].
 * @param editor Current editor.
 * @param delimitCharacters Characters inside the bbcode [], such as "i" or "b"
 */
function bbcodeDelimit(editor: TextEditor, delimitCharacters: string): void {
	if (!editor) {
		return;
	}

	const open = `[${delimitCharacters}]`;
	const close = `[/${delimitCharacters}]`;
	const document = editor.document;
	const selection = editor.selection;
	if (selection.isEmpty) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		editor.edit(edit => edit.insert(selection.start, `${open}${close}`)).then(_x => {
			const newStartIndex = document.offsetAt(editor.selection.start) - close.length;
			editor.selection = new Selection(
				document.positionAt(newStartIndex),
				document.positionAt(newStartIndex)
			);
		});
	}
	else {
		const word = document.getText(selection);
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		editor.edit(edit => edit.replace(selection, `${open}${word}${close}`)).then(_x => {
			const newStartIndex = document.offsetAt(editor.selection.start) + open.length;
			const newEndIndex = document.offsetAt(editor.selection.end) - close.length;
			editor.selection = new Selection(
				document.positionAt(newStartIndex),
				document.positionAt(newEndIndex)
			);
		});
	}
}

export function activate(context: ExtensionContext): void {
	// Register our formatting commands
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
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

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

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'choicescript' }]
	};

	client = new LanguageClient(
		'choicescriptVsCode',
		'ChoiceScript VSCode',
		serverOptions,
		clientOptions
	);

	const wordCountBar = new WordCountBar();
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const controller = new WordCountController(wordCountBar, client);

	// Start the client & launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
