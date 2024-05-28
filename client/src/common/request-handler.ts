import * as vscode from 'vscode';
import { type BaseLanguageClient, RequestType } from 'vscode-languageclient';
import type { URI } from 'vscode-languageclient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FileContentRequest: RequestType<{ uri: URI; encoding?: string }, string, any> = new RequestType('fs/content');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FindFilesRequest: RequestType<{ pattern: string, rootPath?: URI }, URI[], any> = new RequestType('fs/findFiles');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FileExistsRequest: RequestType<URI, boolean, any> = new RequestType('fs/fileExists');

export const registerRequestHandlers = (client: BaseLanguageClient) => {
	client.onRequest(FileContentRequest, async (args: { uri: URI, encoding?: string }) => {
		return new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(args.uri)));
	});
	client.onRequest(FindFilesRequest, async (args: { pattern: string, rootPath?: URI }) => {
		const filePaths = (await vscode.workspace.findFiles(args.pattern)).map(f => f.path);
		return args.rootPath === undefined ? filePaths : filePaths.map(path => path.replace(args.rootPath, ''));  // relative path
	});
	client.onRequest(FileExistsRequest, async (path: URI) => {
		return !!(await vscode.workspace.fs.stat(vscode.Uri.file(path)));
	});
};

