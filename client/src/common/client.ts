import * as path from 'path';
import * as vscode from 'vscode';
import {
	LanguageClientOptions,
	BaseLanguageClient,
} from 'vscode-languageclient';

import { LineAnnotationController } from './annotations';
import { Configuration, CustomCommands, CustomMessages, RandomtestSettingsSource, RelativePaths } from './constants';
import { ChoiceScriptGameRunProvider, ChoiceScriptGameRunnerService } from './game-runner-service';
import { setupLocalStorages as setupLocalStorageManagers } from './localStorageService';
import { Provider } from './logDocProvider';
import * as notifications from './notifications';
import { StatusBarController } from './status-bar-controller';
import { StatusBarItems } from './status-bar-items';
import { registerRequestHandlers } from './request-handler';
import { ChoiceScriptTestProvider } from './choicescript-test-service';

let sceneFilesPath: string;
let imageFilesPath: string;
let annotationController: LineAnnotationController;

export type CsErrorHandler = (scene: string, line: number, message: string) => void;

export type LanguageClientConstructor = (id: string, name: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;
export type GameRunProviderConstructor = (csPath: string, errorHandler?: CsErrorHandler) => ChoiceScriptGameRunProvider;

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
 * @param gameRunner The controller for running the game in a browser.
 * @param docProvider Text document provider.
 * @param testProvider Test-running provider.
 */
function registerCommands(context: vscode.ExtensionContext, controller: StatusBarController, gameRunner: ChoiceScriptGameRunnerService, docProvider: Provider, testProvider?: ChoiceScriptTestProvider) {

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
						vscode.workspace.saveAll().then(
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
						vscode.workspace.saveAll().then(
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
						vscode.workspace.saveAll().then(
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
						vscode.workspace.saveAll().then(
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

	if (gameRunner) { // web platform isn't supported
		csCommands.push(vscode.commands.registerCommand(
			CustomCommands.OpenGame, 
			async () => {
				annotationController.clearAll();
				await gameRunner.run();
			}
		));
	}

	context.subscriptions.push(...csCommands);
}

/**
 * Update the workspace editor.quickSuggestions state for ChoiceScript.
 */
function updateQuickSuggestions(): void {
	const quickSuggestionsState = !vscode.workspace.getConfiguration(Configuration.BaseSection).get(Configuration.DisableQuickSuggestions);
	const quickSuggestionsValue = {
		comments: quickSuggestionsState,
		strings: quickSuggestionsState,
		other: quickSuggestionsState
	};
	const config = vscode.workspace.getConfiguration("", { languageId: "choicescript" });
	config.update("editor.quickSuggestions", quickSuggestionsValue, false, true);
}


export async function startClient(context: vscode.ExtensionContext, clientConstructor: LanguageClientConstructor, gameProviderConstructor?: GameRunProviderConstructor, testProvider?: ChoiceScriptTestProvider): Promise<BaseLanguageClient> {

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'choicescript' }]
	};

	const client = clientConstructor(
		'choicescriptVsCode',
		'ChoiceScript VSCode',
		clientOptions
	);

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
	const annotationsTextDocumentChangedSubscription = vscode.workspace.onDidChangeTextDocument(
		annotationController.onTextDocumentChanged, annotationController
	);
	context.subscriptions.push(
		annotationController,
		annotationsTextDocumentChangedSubscription
	);

	// Deal with configuration changes
	const configurationChangedSubscription = vscode.workspace.onDidChangeConfiguration(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		(e: vscode.ConfigurationChangeEvent) => {
			updateQuickSuggestions();
			client.sendNotification(
				CustomMessages.CoGStyleGuide, vscode.workspace.getConfiguration(Configuration.BaseSection).get(Configuration.UseCOGStyleGuide)
			);
		}
	);
	context.subscriptions.push(configurationChangedSubscription);

	// Set up storage services
	setupLocalStorageManagers(context.workspaceState, context.globalState);

	// Prepare for future ChoiceScript test runs (if we're not on web)
	testProvider?.initializeTestProvider();

	const gameProvider =  gameProviderConstructor? gameProviderConstructor(
		context.asAbsolutePath(RelativePaths.Choicescript),
		annotateCSError
	) : undefined;

	const gameService = new ChoiceScriptGameRunnerService(gameProvider, controller);

	notifications.addNotificationHandler(
		CustomMessages.UpdatedSceneFilesPath,
		async (e: string[]) => {
			sceneFilesPath = e[0];
			await gameProvider._init();
			gameProvider.updateScenePath(gameProvider.gameId, sceneFilesPath);
		}
	);
	notifications.addNotificationHandler(
		CustomMessages.UpdatedImageFilesPath,
		async (e: string[]) => {
			imageFilesPath = e[0];
			await gameProvider._init();
			gameProvider.updateImagePath(gameProvider.gameId, imageFilesPath);
		}
	);

	// Register our commands
	registerCommands(context, controller, gameService, provider, testProvider);

	// Adjust the workspace's quick suggestions setting for ChoiceScript
	updateQuickSuggestions();

	// Start the client & launch the server
	await client.start();

	return client;
}
