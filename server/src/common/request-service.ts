import { Connection, RequestType, URI } from 'vscode-languageserver';

export const FileContentRequest: RequestType<{ uri: URI; encoding?: string }, string, any> = new RequestType('fs/content');
export const FindFilesRequest: RequestType<{ pattern: string, rootPath?: URI }, URI[], any> = new RequestType('fs/findFiles');
export const FileExistsRequest: RequestType<URI, boolean, any> = new RequestType('fs/fileExists');

export class RequestService {
	constructor(private connection: Connection) {}

	public async getFileContents(path: URI): Promise<string> {
		return this.connection.sendRequest(FileContentRequest, { uri: path });
	}

	public async findFiles(pattern: string, rootPath?: URI): Promise<URI[]> {
		return this.connection.sendRequest(FindFilesRequest, { pattern, rootPath });
	}

	public async fileExists(path: URI): Promise<boolean> {
		return this.connection.sendRequest(path);
	}
}
