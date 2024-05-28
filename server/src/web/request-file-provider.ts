import type { FileSystemProvider } from '../common/file-system-service';
import type { RequestService } from '../common/request-service';
import type { URI } from 'vscode-languageserver';

export class RequestFileProvider implements FileSystemProvider {

	constructor(private requestService: RequestService) {}

	public async readFile(path: string): Promise<string> {
		return this.requestService.getFileContents(path);
	}

	public async findFiles(pattern: string, rootPath?: string): Promise<URI[]> {
		return this.requestService.findFiles(pattern, rootPath);
	}

	public async fileExists(path: URI): Promise<boolean> {
		return this.requestService.fileExists(path);
	}
}
