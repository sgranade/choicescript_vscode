import * as path from 'path';
import * as vscode from 'vscode';
import type {
	LanguageClientOptions,
	BaseLanguageClient,
} from 'vscode-languageclient';

import { LineAnnotationController } from './annotations';
import { Configuration, CustomCommands, CustomMessages, RandomtestSettingsSource, RelativePaths } from './constants';
import { setupLocalStorages as setupLocalStorageManagers } from './localStorageService';
import { Provider } from './logDocProvider';
import * as notifications from './notifications';
import { StatusBarController } from './status-bar-controller';
import { StatusBarItems } from './status-bar-items';
import { registerRequestHandlers } from './request-handler';
import type { ChoiceScriptTestProvider } from './choicescript-test-service';
import { ChoiceScriptCompiler } from './choicescript-compiler';
import { GameWebViewManager } from './game-web-view';
import { type IWorkspaceProvider, WorkspaceProviderImpl } from './interfaces/vscode-workspace-provider';

let sceneFilesPath: string;
let imageFilesPath: string;
let annotationController: LineAnnotationController;
let gameWebViewManager: GameWebViewManager;
let csCompiler: ChoiceScriptCompiler;
let workspaceProvider: IWorkspaceProvider;

export type CsErrorHandler = (scene: string, line: number, message: string) => void;
export type LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;

/**
 * Annotate an error from ChoiceScript in the editor.
 * 
 * @param scene Scene name (without `.txt`) that contains the error.
 * @param line 1-based line number where the error occurred.
 * @param message Error message.
 */
function annotateCSError(scene: string, line: number, message: string): void {
	if (sceneFilesPath === undefined) {
		return;
	}
	const scenePath = path.join(sceneFilesPath, scene + ".txt");
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

/**
 * Register the extension's commands.
 * 
 * @param context Extension's context.
 * @param controller Status bar controller.
 * @param docProvider Text document provider.
 * @param testProvider Test-running provider.
 */
function registerCommands(context: vscode.ExtensionContext, controller: StatusBarController, docProvider: Provider, gameWebViewManager: GameWebViewManager, testProvider?: ChoiceScriptTestProvider) {

	const csCommands = [
		vscode.commands.registerTextEditorCommand(
			CustomCommands.Italicize, (editor) => {
				bbcodeDelimit(editor, "i");
			}),
		vscode.commands.registerTextEditorCommand(
			CustomCommands.Bold, (editor) => {
				bbcodeDelimit(editor, "b");
			}),
	];

	if (testProvider) { // web platform isn't supported
		csCommands.push(
			vscode.commands.registerCommand(
				CustomCommands.RunQuicktest, () => {
					annotationController.clearAll();
					if (sceneFilesPath !== undefined) {
						workspaceProvider.saveAll().then(
							() => testProvider.runQuicktest(
								context.asAbsolutePath(RelativePaths.Quicktest),
								context.asAbsolutePath(RelativePaths.Choicescript),
								sceneFilesPath,
								imageFilesPath,
								annotateCSError,
								(running) => controller.updateTestStatus(running)
							)
						);
					}
				}),
			vscode.commands.registerCommand(
				CustomCommands.RunRandomtestDefault, () => {
					annotationController.clearAll();
					if (sceneFilesPath !== undefined) {
						workspaceProvider.saveAll().then(
							() => testProvider.runRandomtest(
								context.asAbsolutePath(RelativePaths.Randomtest),
								context.asAbsolutePath(RelativePaths.Choicescript),
								sceneFilesPath,
								RandomtestSettingsSource.VSCodeConfiguration,
								docProvider,
								annotateCSError,
								(running) => controller.updateTestStatus(running),
								(count) => controller.updateTestCount(count)
							)
						);
					}
				}),
			vscode.commands.registerCommand(
				CustomCommands.RunRandomtestInteractive, () => {
					if (sceneFilesPath !== undefined) {
						annotationController.clearAll();
						workspaceProvider.saveAll().then(
							() => testProvider.runRandomtest(
								context.asAbsolutePath(RelativePaths.Randomtest),
								context.asAbsolutePath(RelativePaths.Choicescript),
								sceneFilesPath,
								RandomtestSettingsSource.Interactive,
								docProvider,
								annotateCSError,
								(running) => controller.updateTestStatus(running),
								(count) => controller.updateTestCount(count)
							)
						);
					}
				}),
			vscode.commands.registerCommand(
				CustomCommands.RerunRandomTest, () => {
					if (sceneFilesPath !== undefined) {
						annotationController.clearAll();
						workspaceProvider.saveAll().then(
							() => testProvider.runRandomtest(
								context.asAbsolutePath(RelativePaths.Randomtest),
								context.asAbsolutePath(RelativePaths.Choicescript),
								sceneFilesPath,
								RandomtestSettingsSource.LastTestRun,
								docProvider,
								annotateCSError,
								(running) => controller.updateTestStatus(running),
								(count) => controller.updateTestCount(count)
							)
						);
					}
				}),
			vscode.commands.registerCommand(
				CustomCommands.CancelTest, () => {
					testProvider.cancelTest();
				})
		);
	}

	csCommands.push(
		vscode.commands.registerCommand(
			CustomCommands.RunGame,
			async () => {
				const run = async () => {
					annotationController.clearAll();
					// Ideally we'd be able to sanity check that these are actually ChoiceScript 'scene' files,
					// but given that raw text files with no commands *are* valid CS scenes, I don't think there's anything we can do.
					const compiledGame = await csCompiler.compile(await workspaceProvider.findFiles(sceneFilesPath, '*.txt'));
					await gameWebViewManager.runCompiledGame(compiledGame);
				};
				if (gameWebViewManager.isRunning()) {
					const result = await vscode.window.showInformationMessage(
						'A ChoiceScript game is already running.\n\nWhat would you like to do?',
						{ detail: 'Running again will destroy your current session.', modal: true },
						'Run',
						'Focus'
					);
					if (result === 'Run') {
						run();
					} else if (result === 'Focus') {
						gameWebViewManager.openOrShow();
					}
				} else {
					run();
				}
			}
		)
	);

	context.subscriptions.push(...csCommands);
}

/**
 * Update the workspace editor.quickSuggestions state for ChoiceScript.
 */
function updateQuickSuggestions(): void {
	const quickSuggestionsState = !workspaceProvider.getConfiguration(Configuration.BaseSection, Configuration.DisableQuickSuggestions);
	const quickSuggestionsValue = {
		comments: quickSuggestionsState,
		strings: quickSuggestionsState,
		other: quickSuggestionsState
	};
	const config = vscode.workspace.getConfiguration("", { languageId: "choicescript" });
	config.update("editor.quickSuggestions", quickSuggestionsValue, false, true);
}


export async function startClient(context: vscode.ExtensionContext, clientConstructor: LanguageClientConstructor, testProvider?: ChoiceScriptTestProvider): Promise<BaseLanguageClient> {

	workspaceProvider = new WorkspaceProviderImpl();

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'choicescript' }]
	};

	const client = clientConstructor(
		'choicescriptVsCode',
		'ChoiceScript VSCode',
		clientOptions
	);

	gameWebViewManager = new GameWebViewManager(context, annotateCSError);
	csCompiler = new ChoiceScriptCompiler(workspaceProvider);

	registerRequestHandlers(client);

	// Be ready to handle notifications
	context.subscriptions.push(notifications.initNotifications(client));

	// Register a new text document provider for log files
	const provider = new Provider();
	const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(Provider.scheme, provider);
	context.subscriptions.push(provider, providerRegistration);

	// Set up the status bar
	const statusBar = new StatusBarItems();
	const controller = new StatusBarController(statusBar, client);

	// Create a controller for error annotations
	annotationController = new LineAnnotationController();
	const annotationsTextDocumentChangedSubscription = workspaceProvider.onDidChangeTextDocument(
		() => annotationController.onTextDocumentChanged, annotationController
	);
	context.subscriptions.push(
		annotationController,
		annotationsTextDocumentChangedSubscription
	);

	// Deal with configuration changes
	const configurationChangedSubscription = workspaceProvider.onDidChangeConfiguration(
		() => {
			updateQuickSuggestions();
			client.sendNotification(
				CustomMessages.CoGStyleGuide, workspaceProvider.getConfiguration(Configuration.BaseSection, Configuration.UseCOGStyleGuide)
			);
		}
	);
	context.subscriptions.push(configurationChangedSubscription);

	// Set up storage services
	setupLocalStorageManagers(context.workspaceState, context.globalState);

	// Prepare for future ChoiceScript test runs (if we're not on web)
	testProvider?.initializeTestProvider();

	notifications.addNotificationHandler(
		CustomMessages.UpdatedSceneFilesPath,
		async (e: string[]) => {
			sceneFilesPath = e[0];
		}
	);
	notifications.addNotificationHandler(
		CustomMessages.UpdatedImageFilesPath,
		async (e: string[]) => {
			imageFilesPath = e[0];
		}
	);
	notifications.addNotificationHandler(
		CustomMessages.DebugMessage,
		async (e: string[]) => {
			const msg = e[0];
			console.log(msg);
		}
	);

	// Register our commands
	registerCommands(context, controller, provider, gameWebViewManager, testProvider);

	// Adjust the workspace's quick suggestions setting for ChoiceScript
	updateQuickSuggestions();

	// Start the client & launch the server
	await client.start();

	return client;
}
