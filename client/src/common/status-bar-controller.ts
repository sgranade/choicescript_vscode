import * as vscode from 'vscode';
import type { ProjectStatus, StatusBarItems } from './status-bar-items';
import { CustomContext, CustomMessages } from './constants';
import * as notifications from './notifications';
import * as URI from 'urijs';
import {
	type BaseLanguageClient,
	Location,
	Range,
} from 'vscode-languageclient';
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

/**
 * Controller for the status bar items.
 */
export class StatusBarController {
	private _statusBar: StatusBarItems;
	private _projectStatus: ProjectStatus;
	private _client: BaseLanguageClient;

	constructor(statusBar: StatusBarItems, client: BaseLanguageClient ) {
		this._statusBar = statusBar;
		this._statusBar.updateWordCount();
		this._client = client;
		this._projectStatus = {
			gameRunning: false,
			loaded: false,
			testRunning: false
		};

		// Subscribe to selection change & editor activation
		const disposables: vscode.Disposable[] = [];
		vscode.window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, disposables);
		vscode.window.onDidChangeTextEditorSelection(this._onDidChangeTextEditorSelection, this, disposables);

		// Subscribe to the event marking a workspace as trusted
		vscode.workspace.onDidGrantWorkspaceTrust(() => {
			this._statusBar.showOrHide(vscode.window.activeTextEditor, this._projectStatus);
		});

		// Subscribe to word count updates from the CS language server and when the project has loaded
		notifications.addNotificationHandler(
			CustomMessages.UpdatedWordCount,
			e => this._onUpdatedWordCount(e[0])
		);
		notifications.addNotificationHandler(
			CustomMessages.ProjectIndexed,
			this._onProjectIndexed
		);
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
	};

	private _onDidChangeActiveTextEditor(e: vscode.TextEditor): void {
		this._statusBar.showOrHide(e, this._projectStatus);
		if (e) {
			this._client.sendRequest(CustomMessages.WordCountRequest, e.document.uri.toString()).then((count: number | null) => {
				count = (count === null) ? undefined : count;
				this._statusBar.updateWordCount(count);
			});
		}
	}

	private _onDidChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent): void {
		const location = Location.create(
			e.textEditor.document.uri.toString(),
			Range.create(e.selections[0].start, e.selections[0].end)
		);
		this._client.sendRequest(CustomMessages.SelectionWordCountRequest, location).then(
			(count: number | null) => {
				count = (count === null) ? undefined : count;
				this._statusBar.updateSelectionCount(count);
			}
		);
	}

	/**
	 * Notify the status bar controller that the project has loaded and been indexed.
	 * 
	 * This is an instance function so we can properly capture "this" b/c of how it's called
	 */
	private _onProjectIndexed = (): void => {
		this._projectStatus.loaded = true;
		const editor = vscode.window.activeTextEditor;
		if (editor !== undefined) {
			this._statusBar.showOrHide(editor, this._projectStatus);
		}
		vscode.commands.executeCommand('setContext', CustomContext.ProjectLoaded, true);
	};

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

	updateTestCount(count: number) {
		this._statusBar.updateTestCount(count);
	}
}