import * as vscode from 'vscode';
import type { AllScenesResult, CompiledChoiceScriptGame } from './choicescript-compiler';

const VIEW_TYPE = 'ChoiceScriptGameView';

export class GameWebViewManager {

	private runIndexHtmlUri: vscode.Uri;
	private panel: vscode.WebviewPanel | undefined;
	private windowTitle: string = "Loading...";

	constructor(
		private readonly extContext: vscode.ExtensionContext,
		private readonly annotateFn: (scene: string, line: number, message: string) => void
	) {
		this.runIndexHtmlUri = vscode.Uri.joinPath(extContext.extensionUri, 'choicescript', 'out', 'index.html');
	}

	public isRunning(): boolean {
		return !!this.panel;
	}

	public async runCompiledGame(game: CompiledChoiceScriptGame) {
		this.openOrShow(game.title);
		this.panel.webview.html = (await this.getWebviewContent(game.scenes)).toString();
	}

	public openOrShow(title?: string) {
		if (title) {
			this.windowTitle = title;
		}
		if (this.panel) {
			this.panel.reveal();
		} else {
			this.panel = vscode.window.createWebviewPanel(
				VIEW_TYPE,
				this.windowTitle,
				vscode.ViewColumn.Beside,
				{
					retainContextWhenHidden: true,
					localResourceRoots: [vscode.Uri.joinPath(this.extContext.extensionUri, 'choicescript'), vscode.workspace.workspaceFolders[0].uri],
					enableScripts: true
				}
			);
			this.registerPanelSubscriptions();
		}
	}

	private async getWebviewContent(allScenes: AllScenesResult): Promise<string> {
		const view = this.panel.webview;
		let content = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.runIndexHtmlUri));
		// The following Content Security Policy doesn't really do much given how much we have to allow to get ChoiceScript to run properly, but it's here as a reminder.
		content = content.replace("<head>", `<head>\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${view.cspSource} https:; img-src ${view.cspSource} 'unsafe-inline' data: https:; script-src ${view.cspSource} 'unsafe-inline' https:; style-src ${view.cspSource} 'unsafe-inline' https:"/>`);
		// So that the contents of the HTML is different and is refreshed on a rerun.
		content = content.replace("<body>", `<body>\n<div style='display: none;' id='time-cache'>${new Date().getTime()}</div>`);
		// Configure the script and style references so that VS Code will allow them to be loaded.
		content = content.replace(/src="([\w\-.]+\.js)"/g, (_match, fileName) => `src="${view.asWebviewUri(vscode.Uri.joinPath(this.extContext.extensionUri, 'choicescript', 'out', fileName)).toString()}"`);
		content = content.replace(/href="([\w.]+\.css)"/g, (_match, fileName) => `href="${view.asWebviewUri(vscode.Uri.joinPath(this.extContext.extensionUri, 'choicescript', 'out', fileName)).toString()}"`);
		// Add our compiled game content, this will be automatically picked up by Scene.js.
		content = content.replace("startLoading();", `allScenes=${JSON.stringify(allScenes)};\nstartLoading();`);
		return content;
	}

	private async registerPanelSubscriptions() {
		this.panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'error':
						vscode.window.showErrorMessage(message.text);
						return;
					case 'annotate':
						this.annotateFn(message.scene, message.line, message.message);
						return;
					case 'convert-resource-uri':
						this.panel.webview.postMessage({ command: 'update-resource-uri', nodeName: message.nodeName, oldSrc: message.src, newSrc: this.panel.webview.asWebviewUri(vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, message.src)).toString() })
						return;
				}
			},
			undefined,
			this.extContext.subscriptions
		);
		this.panel.onDidDispose(
			() => {
				this.panel = undefined;
			},
			null,
			this.extContext.subscriptions
		);
	}

}
