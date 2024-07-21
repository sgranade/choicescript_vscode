import type { FileSystemProvider } from '../common/file-system-service';
import type { URI } from 'vscode-languageserver';
import * as fs from 'fs/promises';
import * as globby from 'globby';

export class SystemFileProvider implements FileSystemProvider {

	public async readFile(path: URI): Promise<string> {
		return ((await fs.readFile(path)).toString());
	}

	public async findFiles(pattern: string, rootPath?: string): Promise<URI[]> {
		return globby(pattern, { cwd: rootPath });
	}

	public async fileExists(path: URI): Promise<boolean> {
		try {
			await fs.access(path, fs.constants.F_OK);
			return true;
		} catch (err) {
			return false;
		}
	}

}
