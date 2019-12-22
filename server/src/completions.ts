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
						completions = generateCompletionsFromIndex(projectIndex.getLabels(document), CompletionItemKind.Reference, "labels-local");
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
						let sceneLabels = projectIndex.getSceneLabels(tokens[1]);
						if (sceneLabels !== undefined) {
							completions = generateCompletionsFromIndex(sceneLabels, CompletionItemKind.Reference, "labels-scene");
						}
					}
			}
		}
	}
	// Auto-complete variables
	else if (text[start] == '{') {
		// Only auto-complete if we're not a multi-replace like @{} or @!{} or @!!{}
		var isMultireplace = false;
		for (var i = start-1; i >= 0 && i >= start-3; i--) {
			if (text[i] == '@') {
				isMultireplace = true;
				break;
			}
		}
		if (!isMultireplace) {
			let variablesMap = projectIndex.getLocalVariables(document);
			if (variablesMap !== undefined) {
				completions = Array.from(iteratorMap(variablesMap.keys(), (x: string) => ({
						label: x, 
						kind: CompletionItemKind.Variable, 
						data: "variable-local"
				})));
			}
			variablesMap = projectIndex.getGlobalVariables();
			completions.push(...Array.from(iteratorMap(variablesMap.keys(), (x: string) => ({
				label: x,
				kind: CompletionItemKind.Variable,
				data: "variable-global"
			}))));
		}
	}
}
return completions;
}