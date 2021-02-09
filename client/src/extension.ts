import path = require('path');
import URI = require('urijs');
import * as vscode from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	Location,
	Range,
	TransportKind,
	integer
} from 'vscode-languageclient/node';
import { LineAnnotationController } from './annotations';
import { CSUrls, CustomCommands, CustomMessages, RelativePaths } from './constants';
import { runQuicktest, runRandomtest, cancelTest } from './csTests';
import GameServer from './gameserver';
import { Provider } from './logDocProvider';


let client: LanguageClient;
let projectFiles: Map<string, string>;
let annotationController: LineAnnotationController;


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

interface ProjectStatus {
	loaded: boolean,
	gameRunning: boolean,
	testRunning: boolean
}

/**
 * Status bar items.
 */
class StatusBarItems {
	private _runningTestItem: vscode.StatusBarItem;
	private _openGameStatusBarItem: vscode.StatusBarItem;
	private _reloadGameStatusBarItem: vscode.StatusBarItem;
	private _wordCountStatusBarItem: vscode.StatusBarItem;
	private _wordCount: number | undefined;
	private _selectionCount: number | undefined;
	private _disposable: vscode.Disposable;

	constructor() {
		this._runningTestItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 8);
		this._runningTestItem.command = CustomCommands.CancelTest;
		this._runningTestItem.text = "$(sync~spin) Running CS Test";
		this._runningTestItem.tooltip = "Press to stop the running test";
		this._openGameStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
		this._openGameStatusBarItem.text = "$(open-preview) Open";
		this._openGameStatusBarItem.tooltip = "Press to open game in browser";
		this._openGameStatusBarItem.command = CustomCommands.OpenGame;
		this._reloadGameStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
		this._reloadGameStatusBarItem.text = "$(refresh) Reload";
		this._openGameStatusBarItem.tooltip = "Press to reload previously-opened game";
		this._reloadGameStatusBarItem.command = CustomCommands.ReloadGame;
		this._wordCountStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
		this._disposable = vscode.Disposable.from(
			this._runningTestItem,
			this._openGameStatusBarItem,
			this._reloadGameStatusBarItem,
			this._wordCountStatusBarItem
		);
	}

	public showOrHide(editor: vscode.TextEditor | undefined, projectStatus: ProjectStatus): void {
		if (projectStatus.testRunning) {
			this._runningTestItem.show();
		}
		else {
			this._runningTestItem.hide();
		}

		if (editor === undefined) {
			this._openGameStatusBarItem.hide();
			this._reloadGameStatusBarItem.hide();
			this._wordCountStatusBarItem.hide();
		}
		else {
			const doc = editor.document;

			if (doc.languageId === "choicescript") {
				this._updateText();
				if (projectStatus.loaded) {
					this._openGameStatusBarItem.show();
				}
				if (projectStatus.gameRunning) {
					this._reloadGameStatusBarItem.show();
				}
				this._wordCountStatusBarItem.show();
			}
			else {
				this._openGameStatusBarItem.hide();
				this._reloadGameStatusBarItem.hide();
				this._wordCountStatusBarItem.hide();
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

		this._wordCountStatusBarItem.text = text;
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
		this._disposable.dispose();
	}
}

/**
 * Controller for the word count status bar item.
 */
class StatusBarController {
	private _statusBar: StatusBarItems;
	private _projectStatus: ProjectStatus;
	private _disposable: vscode.Disposable;

	constructor(statusBar: StatusBarItems) {
		this._statusBar = statusBar;
		this._statusBar.updateWordCount();
		this._projectStatus = {
			gameRunning: false,
			loaded: false,
			testRunning: false
		}

		// Subscribe to selection change & editor activation
		const disposables: vscode.Disposable[] = [];
		vscode.window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, disposables);
		vscode.window.onDidChangeTextEditorSelection(this._onDidChangeTextEditorSelection, this, disposables);

		// Subscribe to word count updates from the CS language server
		client.onReady().then(() => {
			disposables.push(client.onNotification(CustomMessages.UpdatedWordCount, this._onUpdatedWordCount));
			this._disposable = vscode.Disposable.from(...disposables);
		});
	}

	// This is an instance function so we can properly capture "this" b/c of how it's called
	private _onUpdatedWordCount = (e: UpdatedWordCount): void => {
		const editor = vscode.window.activeTextEditor;

		if (editor === undefined) {
			return;
		}

		const editorUri = URI(editor.document.uri.toString()).normalize();
		const updatedUri = URI(e.uri).normalize();
		if (editorUri.equals(updatedUri)) {
			this._statusBar.showOrHide(editor, this._projectStatus);
			this._statusBar.updateWordCount(e.count);
		}
	}

	private _onDidChangeActiveTextEditor(e: vscode.TextEditor): void {
		this._statusBar.showOrHide(e, this._projectStatus);
		client.sendRequest(CustomMessages.WordCountRequest, e.document.uri.toString()).then((count: number | null) => {
			count = (count === null) ? undefined : count;
			this._statusBar.updateWordCount(count);
		});
	}

	private _onDidChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent): void {
		const location = Location.create(
			e.textEditor.document.uri.toString(),
			Range.create(e.selections[0].start, e.selections[0].end)
		);
		client.sendRequest(CustomMessages.SelectionWordCountRequest, location).then(
			(count: number | null) => {
				count = (count === null) ? undefined : count;
				this._statusBar.updateSelectionCount(count);
			}
		);
	}

	/**
	 * Notify the status bar controller that the project has loaded.
	 */
	projectLoaded(): void {
		this._projectStatus.loaded = true;
		const editor = vscode.window.activeTextEditor;
		if (editor !== undefined) {
			this._statusBar.showOrHide(editor, this._projectStatus);
		}
	}

	/**
	 * Notify the status bar controller that the game has been run.
	 */
	gameRun(): void {
		this._projectStatus.gameRunning = true;
		const editor = vscode.window.activeTextEditor;
		if (editor !== undefined) {
			this._statusBar.showOrHide(editor, this._projectStatus);
		}
	}

	/**
	 * Notify the status bar controller that tests are running or not.
	 * 
	 * @param running Whether tests are running or not.
	 */
	updateTestStatus(running: boolean) {
		this._projectStatus.testRunning = running;
		const editor = vscode.window.activeTextEditor;
		if (editor !== undefined) {
			this._statusBar.showOrHide(editor, this._projectStatus);
		}
	}

	public dispose(): void {
		this._disposable.dispose();
	}
}


/**
 * Annotate an error from ChoiceScript in the editor.
 * 
 * @param scene Scene name (without `.txt`) that contains the error.
 * @param line 1-based line number where the error occurred.
 * @param message Error message.
 */
function annotateCSError(scene: string, line: integer, message: string): void {
	if (projectFiles === undefined) {
		return;
	}
	scene += ".txt";
	const scenePath = projectFiles.get(scene);
	if (scenePath !== undefined) {
		vscode.workspace.openTextDocument(scenePath).then((document) => {
			vscode.window.showTextDocument(document).then((editor) => {
				line -= 1;
				const range = document.validateRange(new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER));
				editor.revealRange(
					range,
					vscode.TextEditorRevealType.InCenterIfOutsideViewport
				);
				editor.selection = new vscode.Selection(line, 0, line, 0);
				annotationController.addTrailingAnnotation(editor, line, `Error: ${message.trim()}`);
			});
		});
	}
}

class GameRunner {
	private _server: GameServer;
	private _statusBarController: StatusBarController;
	private _disposable: vscode.Disposable;

	constructor(
		context: vscode.ExtensionContext, 
		statusBarController: StatusBarController, 
		csErrorHandler?: (scene: string, line: integer, message: string) => void
	) {
		const disposables: vscode.Disposable[] = [];
		this._server = new GameServer(context.asAbsolutePath(RelativePaths.Choicescript), csErrorHandler);
		disposables.push(this._server);
		this._statusBarController = statusBarController;

		client.onReady().then(() => {
			disposables.push(client.onNotification(CustomMessages.UpdatedProjectFiles, (e: string[]): void => {
				projectFiles = new Map(e.map((file: string) => [path.basename(file), file]));
				const map = new Map(projectFiles);
				map.set("cs-extension.js", context.asAbsolutePath(RelativePaths.CSExtension));
				this._server.setFileMap(map);
				statusBarController.projectLoaded();
				vscode.commands.executeCommand('setContext', CustomCommands.ProjectLoaded, true);
			}));
			this._disposable = vscode.Disposable.from(...disposables);
		})
	}

	/**
	 * Set the game's index file.
	 * 
	 * @param indexFile Resolved path to the game index file.
	 */
	public setGameIndexFile(indexFile: string | undefined) {
		this._server.setGameIndexFile(indexFile);
	}

	/**
	 * Run the game.
	 */
	public async run(): Promise<void> {
		annotationController.clear(vscode.window.activeTextEditor);
		await this._server.openInBrowser(this._server.getRootPath()+CSUrls.GameIndex);
		vscode.commands.executeCommand('setContext', CustomCommands.GameOpened, true);
		this._statusBarController.gameRun();
	}
	
	/**
	 * Reload the game in any browser.
	 */
	public reload(): void {
		annotationController.clear(vscode.window.activeTextEditor);
		this._server.refreshBrowser();
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
function bbcodeDelimit(editor: vscode.TextEditor, delimitCharacters: string): void {
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
			editor.selection = new vscode.Selection(
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
			editor.selection = new vscode.Selection(
				document.positionAt(newStartIndex),
				document.positionAt(newEndIndex)
			);
		});
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const serverModule = context.asAbsolutePath(
		RelativePaths.VSCodeExtensionServer
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

	const provider = new Provider();
	const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(Provider.scheme, provider);
	context.subscriptions.push(provider, providerRegistration);

	const statusBar = new StatusBarItems();
	const controller = new StatusBarController(statusBar);
	context.subscriptions.push(statusBar, controller);

	annotationController = new LineAnnotationController();
	context.subscriptions.push(annotationController);

	const gameRunner = new GameRunner(
		context,
		controller,
		annotateCSError
	);
	gameRunner.setGameIndexFile(context.asAbsolutePath(RelativePaths.GameIndex));
	context.subscriptions.push(gameRunner);

	// Register our commands
	const csCommands = [
		vscode.commands.registerTextEditorCommand(
			CustomCommands.Italicize, (editor) => {
				bbcodeDelimit(editor, "i");
		}),
		vscode.commands.registerTextEditorCommand(
			CustomCommands.Bold, (editor) => {
				bbcodeDelimit(editor, "b");
		}),
		vscode.commands.registerCommand(
			CustomCommands.OpenGame, async () => {
				await gameRunner.run();
		}),
		vscode.commands.registerCommand(
			CustomCommands.ReloadGame, () => {
				gameRunner.reload();
		}),
		vscode.commands.registerCommand(
			CustomCommands.RunQuicktest, () => {
				if (projectFiles !== undefined && projectFiles.size > 0) {
					runQuicktest(
						context.asAbsolutePath(RelativePaths.Quicktest),
						context.asAbsolutePath(RelativePaths.Choicescript),
						path.dirname(Array.from(projectFiles.values())[0]),
						annotateCSError,
						(running) => controller.updateTestStatus(running)
					);
				}
		}),
		vscode.commands.registerCommand(
			CustomCommands.RunRandomtestDefault, () => {
				if (projectFiles !== undefined && projectFiles.size > 0) {
					runRandomtest(
						context.asAbsolutePath(RelativePaths.Randomtest),
						context.asAbsolutePath(RelativePaths.Choicescript),
						path.dirname(Array.from(projectFiles.values())[0]),
						false,
						provider,
						annotateCSError,
						(running) => controller.updateTestStatus(running)
					);
				}
		}),
		vscode.commands.registerCommand(
			CustomCommands.RunRandomtestInteractive, () => {
				if (projectFiles !== undefined && projectFiles.size > 0) {
					runRandomtest(
						context.asAbsolutePath(RelativePaths.Randomtest),
						context.asAbsolutePath(RelativePaths.Choicescript),
						path.dirname(Array.from(projectFiles.values())[0]),
						true,
						provider,
						annotateCSError,
						(running) => controller.updateTestStatus(running)
					);
				}
		}),
		vscode.commands.registerCommand(
			CustomCommands.CancelTest, () => {
				cancelTest();
		}),
	];

	context.subscriptions.push(...csCommands);

	// Start the client & launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
