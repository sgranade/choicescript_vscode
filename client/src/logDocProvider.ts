import * as crypto from 'crypto';
import * as vscode from 'vscode';
import LogDocument from './logDocument';

export class Provider implements vscode.TextDocumentContentProvider {
	static scheme = 'CSLog';

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private _documents = new Map<string, LogDocument>();
	private _disposable: vscode.Disposable;

	constructor() {
		this._disposable = vscode.Disposable.from(
			// Subscribe to document close events so we remove it from our model
			vscode.workspace.onDidCloseTextDocument(doc => this._documents.delete(doc.uri.toString())),
			this._onDidChange
		);
	}

	dispose() {
		this._disposable.dispose();
		this._documents.clear();
	}

	get onDidChange() {
		return this._onDidChange.event;
	}

	provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
		return this._documents.get(uri.toString())?.value;
	}

	/**
	 * Get a log document from the provider based on its URI.
	 * 
	 * If the document doesn't exist, it will be created.
	 * The URI must match the scheme given in generateLogUri().
	 * 
	 * @param uri URI associated with the document, or undefined if the URI isn't
	 * in the correct format for a log document.
	 */
	getLogDocument(uri: vscode.Uri): LogDocument | undefined {
		if (!isLogUri(uri)) {
			return undefined;
		}

		let document = this._documents.get(uri.toString());
		if (document === undefined) {
			document = new LogDocument(uri, this._onDidChange);
			this._documents.set(uri.toString(), document);
		}
		return document;
	}
}


/**
 * Determine if a URI corresponds to a log document's.
 * 
 * @param uri URI to test.
 */
function isLogUri(uri: vscode.Uri): boolean {
	return (uri.toString().startsWith(`${Provider.scheme}:Log.`));
}


/**
 * Generate a unique URI for a log.
 * 
 * @param logName Name of the log type (such as "Quicktest").
 */
export function generateLogUri(logName: string): vscode.Uri {
	return vscode.Uri.parse(`${Provider.scheme}:Log.${logName}?id=${crypto.randomBytes(16).toString('hex')}`);
}


/**
 * Convert a log URI to a filename suitable for saving that log.
 * 
 * @param uri URI to convert.
 */
export function logUriToFilename(uri: vscode.Uri): string | undefined {
	const testName = uri.path.split('.')[1];
	const id = uri.query.replace('id=', '');
	return `${testName}-${id}.txt`;
}