import { 
	TextDocument,
	Position,
	Range,
	TextEdit,
	CompletionItem,
	CompletionItemKind
} from 'vscode-languageserver';

import { ProjectIndex, IdentifierIndex, ReadonlyIdentifierIndex } from './indexer';
import { validCommandsCompletions, startupCommandsCompletions, uriIsStartupFile } from './language';
import { extractToMatchingDelimiter } from './utilities';

/**
 * Generator for mapping a function over an iterable.
 * 
 * @param iterable Iterable to map over.
 * @param transform Function to map over iterable.
 */
function* iteratorMap<T>(iterable: Iterable<T>, transform: Function) {
	for (var item of iterable) {
		yield transform(item);
	}
}

function generateCompletionsFromArray(array: ReadonlyArray<string>, 
		kind: CompletionItemKind, dataDescription: string): CompletionItem[] {
	return array.map((x: string) => ({
		label: x,
		kind: kind,
		data: dataDescription
	}));
}

function generateCompletionsFromIndex(index: ReadonlyIdentifierIndex | IdentifierIndex, 
		kind: CompletionItemKind, dataDescription: string): CompletionItem[] {
	return Array.from(iteratorMap(index.keys(), (x: string) => ({
		label: x, 
		kind: kind, 
		data: dataDescription
	})));
}

function generateVariableCompletions(localVariablesIndex: ReadonlyIdentifierIndex, 
	globalVariables: ReadonlyIdentifierIndex,
	achievements: ReadonlyIdentifierIndex | undefined): CompletionItem[] {
	let completions = Array.from(iteratorMap(localVariablesIndex.keys(), (x: string) => ({
			label: x, 
			kind: CompletionItemKind.Variable, 
			data: "variable-local"
	})));
	completions.push(...Array.from(iteratorMap(globalVariables.keys(), (x: string) => ({
		label: x,
		kind: CompletionItemKind.Variable,
		data: "variable-global"
	}))));
	if (achievements !== undefined) {
		completions.push(...Array.from(iteratorMap(achievements.keys(), (x: string) => ({
			label: "choice_achieved_" + x,
			kind: CompletionItemKind.Variable,
			data: "variable-achievement"
		}))));
	}

	return completions;
}

export function generateInitialCompletions(document: TextDocument, position: Position, projectIndex: ProjectIndex): CompletionItem[] {
	let completions: CompletionItem[] = [];

	// Find out what trigger character started this by loading the document and scanning backwards
	let text = document.getText();
	let index = document.offsetAt(position);

	let start: number | null = null;

	for (var i = index; i >= 0; i--) {
		if (text[i] == '*' || text[i] == '{') {
			start = i;
			break;
		}
		// Don't go further back than the current line
		if (text[i] == '\n') {
			break;
		}
	}
	if (start !== null) {
		// Auto-complete commands
		if (text[start] == '*') {
			let tokens = text.slice(i+1, index).split(/\s+/);
			if (tokens.length == 1) {
				completions = [...validCommandsCompletions];  // makin' copies
				// Add in startup-only commands if valid
				if (uriIsStartupFile(document.uri)) {
					completions.push(...startupCommandsCompletions);
				}
			}
			else {
				switch (tokens[0]) {
					case "goto":
					case "gosub":
						if (tokens.length == 2) {
							completions = generateCompletionsFromIndex(projectIndex.getLabels(document.uri), CompletionItemKind.Reference, "labels-local");
						}
						break;

					case "goto_scene":
					case "gosub_scene":
						if(tokens.length == 2) {
							completions = generateCompletionsFromArray(projectIndex.getSceneList(), CompletionItemKind.Reference, "scenes");
							// Scene names can contain "-", which messes up autocomplete because a dash isn't a word character
							// Get around that by specifying the replacement range if needed
							if (tokens[1].includes("-")) {
								let range = Range.create(document.positionAt(index - tokens[1].length), position);
								completions.forEach(completion => {
									completion.textEdit = TextEdit.replace(range, completion.label);
								})
							}
						}
						else if (tokens.length == 3) {
							let sceneUri = projectIndex.getSceneUri(tokens[1]);
							if (sceneUri !== undefined) {
								completions = generateCompletionsFromIndex(projectIndex.getLabels(sceneUri), CompletionItemKind.Reference, "labels-scene");
							}
						}
						break;

					case "set":
					case "delete":
					case "if":
					case "elseif":
					case "elsif":
						completions = generateVariableCompletions(
							projectIndex.getLocalVariables(document.uri), 
							projectIndex.getGlobalVariables(),
							projectIndex.getAchievements());
						break;

					case "achieve":
						completions = generateCompletionsFromIndex(
							projectIndex.getAchievements(),
							CompletionItemKind.Variable,
							"achievement"
						);
				}
			}
		}
		// Auto-complete variable references
		else if (text[start] == '{') {
			let isMultireplace = false;
			for (var i = start-1; i >= 0 && i >= start-3; i--) {
				if (text[i] == '@') {
					isMultireplace = true;
					break;
				}
			}
			let returnVariableCompletions = false;

			// In a multi-replace like @{}, only auto-complete if we're in the first section
			if (isMultireplace) {
				let section = text.slice(start + 1, index+1);
				if (section == "}" || section == "\r") {
					returnVariableCompletions = true;
				}
				else if (section.length > 1 && section[0] == '(') {
					let innards = section.slice(1);
					let balancedParens = extractToMatchingDelimiter(innards, "(", ")");
					if (balancedParens === undefined || (balancedParens == innards || balancedParens + ")" == innards)) {
						returnVariableCompletions = true;
					}
				}
				else {
					if (!/\W/.test(section)) {
						returnVariableCompletions = true;
					}
				}
			}
			else {
				returnVariableCompletions = true;
			}

			if (returnVariableCompletions)
				completions = generateVariableCompletions(
					projectIndex.getLocalVariables(document.uri), 
					projectIndex.getGlobalVariables(),
					undefined);
		}
	}
	return completions;
}