import type { URI as Uri } from 'vscode-uri';
import type { IWorkspaceProvider } from './interfaces/vscode-workspace-provider';

export type AllScenesResult = { [key: string]: { labels: { [key: string]: number }, lines: string[] }; }
export type CompiledChoiceScriptGame = {
	title: string,
	scenes: AllScenesResult
}

export const labelRegex = /^\s*\*label\s+(\w+)/;
export const titleRegex = /^\s*\*title\s+([\w\s]+)/;

export class ChoiceScriptCompiler {

	constructor(
		private readonly workspaceProvider: IWorkspaceProvider
	) {}

	public async compile(scenes: Uri[]): Promise<CompiledChoiceScriptGame>{
		const allScenes: AllScenesResult = {};
		let title: string;
	
		for (const s of scenes) {
			const m = /([^\\|/]+?)(?:.txt)?$/.exec(s.fsPath);
			const sceneName = m[1];
			allScenes[sceneName] = { labels: {}, lines: [] };
			const content = new TextDecoder().decode((await this.workspaceProvider.fs.readFile(s)));
			allScenes[sceneName].lines = content.split(/\r?\n/);
			for (let l = 0; l < allScenes[sceneName].lines.length; l++) {
				if (sceneName === 'startup' && !title) {
					const match = allScenes[sceneName].lines[l].match(titleRegex);
					if (match) {
						title = match[1];
					}
				}
				const labelMatch = allScenes[sceneName].lines[l].match(labelRegex);
				if (labelMatch) {
					allScenes[sceneName].labels[labelMatch[1].toLowerCase()] = l;
				}
			}
		}
		return {
			title: title,
			scenes: allScenes
		};
	}
}

