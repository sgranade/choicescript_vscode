import * as vscode from 'vscode';
import { CustomCommands } from './constants';

export interface ProjectStatus {
	loaded: boolean,
	gameRunning: boolean,
	testRunning: boolean
}

/**
 * Status bar items.
 */
export class StatusBarItems {
	private _runningTestItem: vscode.StatusBarItem;
	private _runGameStatusBarItem: vscode.StatusBarItem;
	private _wordCountStatusBarItem: vscode.StatusBarItem;
	private _wordCount: number | undefined;
	private _selectionCount: number | undefined;
	private _disposable: vscode.Disposable;

	constructor() {
		this._runningTestItem = vscode.window.createStatusBarItem("cs_running_tests", vscode.StatusBarAlignment.Left, 8);
		this._runningTestItem.command = CustomCommands.CancelTest;
		this._runningTestItem.name = "ChoiceScript: Running Tests";
		this._runningTestItem.text = "$(sync~spin) Running CS Test";
		this._runningTestItem.tooltip = "Press to stop the running test";
		this._runGameStatusBarItem = vscode.window.createStatusBarItem("cs_run_game", vscode.StatusBarAlignment.Left, 10);
		this._runGameStatusBarItem.name = "ChoiceScript: Run Game";
		this._runGameStatusBarItem.text = "$(open-preview) Run Game";
		this._runGameStatusBarItem.tooltip = "Press to run game";
		this._runGameStatusBarItem.command = CustomCommands.RunGame;
		this._wordCountStatusBarItem = vscode.window.createStatusBarItem("cs_word_count", vscode.StatusBarAlignment.Right, 1000);
		this._wordCountStatusBarItem.name = "ChoiceScript: Word Count";
		this._disposable = vscode.Disposable.from(
			this._runningTestItem,
			this._runGameStatusBarItem,
			this._wordCountStatusBarItem
		);
	}

	public showOrHide(editor: vscode.TextEditor | undefined, projectStatus: ProjectStatus): void {
		if (projectStatus.testRunning) {
			// Reset the test text
			this._updateTestText();
			this._runningTestItem.show();
		}
		else {
			this._runningTestItem.hide();
		}

		if (editor === undefined) {
			this._runGameStatusBarItem.hide();
			this._wordCountStatusBarItem.hide();
		}
		else {
			const doc = editor.document;

			if (doc.languageId === "choicescript") {
				this._updateWordCountText();
				if (projectStatus.loaded && vscode.workspace.isTrusted) {
					this._runGameStatusBarItem.show();
				}
				else {
					this._runGameStatusBarItem.hide();
				}
				this._wordCountStatusBarItem.show();
			}
			else {
				this._runGameStatusBarItem.hide();
				this._wordCountStatusBarItem.hide();
			}
		}
	}

	private _updateWordCountText(): void {
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

	private _updateTestText(count?: number): void {
		let text = "Running CS Test";

		if (count === undefined) {
			text = "$(sync~spin) "+text;
		}
		else {
			text += " ("+count+")";
		}

		this._runningTestItem.text = text;
	}

	public updateTestCount(count: number): void {
		this._updateTestText(count);
	}

	public updateWordCount(wordCount: number | undefined = undefined): void {
		this._wordCount = wordCount;
		this._updateWordCountText();
	}

	public updateSelectionCount(selectionCount: number | undefined = undefined): void {
		this._selectionCount = selectionCount;
		this._updateWordCountText();
	}

	public dispose(): void {
		this._disposable.dispose();
	}
}
