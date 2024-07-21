import type { URI } from 'vscode-languageserver';

export class FileSystemService {
	constructor(private provider: FileSystemProvider) {}

	public readFile(path: URI): Promise<string> {
		return this.provider.readFile(path);
	}

	public findFiles(pattern: string, rootPath?: string): Promise<URI[]> {
		return this.provider.findFiles(pattern, rootPath);
	}

	public fileExists(path: URI): Promise<boolean> {
		return this.provider.fileExists(path);
	}
}

export interface FileSystemProvider {
	readFile: (path: URI) => Promise<string>;
	findFiles: (pattern: string, rootPath?: string) => Promise<URI[]>;
	fileExists: (path: URI) => Promise<boolean>;
}