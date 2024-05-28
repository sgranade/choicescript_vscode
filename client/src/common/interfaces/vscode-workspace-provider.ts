import { workspace, RelativePattern } from 'vscode';
import type { Disposable } from 'vscode-languageclient';
import type { URI as Uri } from 'vscode-uri';

type LanguageScope = {
	/**
	 * The uri of a {@link TextDocument text document}
	 */
	uri?: Uri;
	/**
	 * The language of a text document
	 */
	languageId: string;
};

export interface IWorkspaceProvider {
	saveAll(): Thenable<boolean>;
	findFiles(base: string, include: string, exclude?: string, maxResults?: number): Thenable<Uri[]>;
	getConfiguration<T>(section: string, item: string, scope?: LanguageScope): T;
	onDidChangeConfiguration(handler: () => void): Disposable;
	onDidChangeTextDocument<T>(handler: () => void, thisTarget: T): Disposable;
	fs: {
		readFile: (uri: Uri) => Thenable<Uint8Array>
	}
}

export class WorkspaceProviderImpl implements IWorkspaceProvider {

	public fs = {
		readFile: workspace.fs.readFile
	};

	public saveAll(): Thenable<boolean> {
		return workspace.saveAll();
	}

	public onDidChangeConfiguration(handler: () => void): Disposable {
		return workspace.onDidChangeConfiguration(handler);
	}

	public onDidChangeTextDocument<T>(handler: () => void, thisTarget: T): Disposable {
		return workspace.onDidChangeTextDocument(handler, thisTarget);
	}

	public getConfiguration<T>(section: string, item: string, scope: LanguageScope): T {
		return workspace.getConfiguration(section, scope).get<T>(item);
	}

	public findFiles(base: string, include: string, exclude?: string, maxResults?: number) {
		const iPattern = new RelativePattern(base, include);
		const ePattern = new RelativePattern(base, exclude || "");
		return workspace.findFiles(iPattern, ePattern, maxResults);
	}
}
