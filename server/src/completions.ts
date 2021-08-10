import {
	Position,
	Range,
	Location,
	TextEdit,
	CompletionItem,
	CompletionItemKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ProjectIndex, IdentifierIndex, ReadonlyIdentifierIndex, ReadonlyLabelIndex, LabelIndex } from "./index";
import { validCommandsCompletions, startupCommandsCompletions, uriIsStartupFile } from './language';
import { extractToMatchingDelimiter, comparePositions, positionInRange, iteratorMap, iteratorFilter } from './utilities';

function generateCompletionsFromArray(array: ReadonlyArray<string>,
	kind: CompletionItemKind, dataDescription: string): CompletionItem[] {
	return array.map((x: string) => ({
		label: x,
		kind: kind,
		data: dataDescription
	}));
}

function generateCompletionsFromIndex(
	index: ReadonlyIdentifierIndex | IdentifierIndex | ReadonlyLabelIndex | LabelIndex,
	kind: CompletionItemKind, dataDescription: string): CompletionItem[] {
	return Array.from(iteratorMap(index.keys(), (x: string) => ({
		label: x,
		kind: kind,
		data: dataDescription
	})));
}

function generateVariableCompletions(document: TextDocument, position: Position, projectIndex: ProjectIndex): CompletionItem[] {
	// Only offer local variables that have been created, taking into account subroutine-defined variables
	const localVariables = new Map(projectIndex.getLocalVariables(document.uri));
	for (const [variable, location] of projectIndex.getSubroutineLocalVariables(document.uri).entries()) {
		const existingLocations = Array.from(localVariables.get(variable) ?? []);
		existingLocations.push(location);
		localVariables.set(variable, existingLocations);
	}

	const availableVariablesGenerator = iteratorFilter(localVariables.entries(), ([variable, locations]: [string, readonly Location[]]) => {  // eslint-disable-line @typescript-eslint/no-unused-vars
		for (const location of locations) {
			if (comparePositions(location.range.end, position) <= 0)
				return true;
		}
		return false;
	});

	const completions = Array.from(iteratorMap(availableVariablesGenerator, ([variable, location]: [string, readonly Location[]]) => ({  // eslint-disable-line @typescript-eslint/no-unused-vars
		label: variable,
		kind: CompletionItemKind.Variable,
		data: "variable-local"
	})));

	completions.push(...Array.from(iteratorMap(projectIndex.getGlobalVariables().keys(), (x: string) => ({
		label: x,
		kind: CompletionItemKind.Variable,
		data: "variable-global"
	}))));

	let includeAchievements = false;
	for (const scope of projectIndex.getDocumentScopes(document.uri).achievementVarScopes) {
		if (positionInRange(position, scope)) {
			includeAchievements = true;
			break;
		}
	}

	if (includeAchievements) {
		completions.push(...Array.from(iteratorMap(projectIndex.getAchievements().keys(), (x: string) => ({
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
	const text = document.getText();
	const index = document.offsetAt(position);

	let start: number | undefined = undefined;
	let i = index;

	for (; i >= 0; i--) {
		if (text[i] == '*' || text[i] == '{') {
			start = i;
			break;
		}
		// Don't go further back than the current line
		if (text[i] == '\n') {
			break;
		}
	}
	if (start !== undefined) {
		// Auto-complete commands
		if (text[start] == '*') {
			const tokens = text.slice(i + 1, index).split(/\s+/);
			if (tokens.length == 1) {
				completions = [...validCommandsCompletions];  // makin' copies
				// Add in startup-only commands if valid
				if (uriIsStartupFile(document.uri)) {
					completions.push(...startupCommandsCompletions);
				}
			}
			else {
				switch (tokens[0]) {
					case "gosub":
						// Complete variables
						if (tokens.length > 2) {
							completions = generateVariableCompletions(document, position, projectIndex);
							break;
						}
						// Fall through to the goto
					case "goto":
						if (tokens.length == 2) {
							completions = generateCompletionsFromIndex(projectIndex.getLabels(document.uri), CompletionItemKind.Reference, "labels-local");
						}
						break;

					case "gosub_scene":
						// Complete variables
						if (tokens.length > 3) {
							completions = generateVariableCompletions(document, position, projectIndex);
							break;
						}
						// Fall through to the goto_scene
					case "goto_scene":
						if (tokens.length == 2) {
							completions = generateCompletionsFromArray(projectIndex.getSceneList(), CompletionItemKind.Reference, "scenes");
							// Scene names can contain "-", which messes up autocomplete because a dash isn't a word character
							// Get around that by specifying the replacement range if needed
							if (tokens[1].includes("-")) {
								const range = Range.create(document.positionAt(index - tokens[1].length), position);
								completions.forEach(completion => {
									completion.textEdit = TextEdit.replace(range, completion.label);
								});
							}
						}
						else if (tokens.length == 3) {
							const sceneUri = projectIndex.getSceneUri(tokens[1]);
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
					case "rand":
						completions = generateVariableCompletions(document, position, projectIndex);
						break;

					case "create":
					case "temp":
						if (tokens.length > 2) {
							completions = generateVariableCompletions(document, position, projectIndex);
						}
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
			for (let j = start - 1; j >= 0 && j >= start - 3; j--) {
				if (text[j] == '@') {
					isMultireplace = true;
					break;
				}
			}
			let returnVariableCompletions = false;

			// In a multi-replace like @{}, only auto-complete if we're in the first section
			if (isMultireplace) {
				const section = text.slice(start + 1, index + 1);
				if (section == "}" || section == "\r" || section.trim() == "") {
					returnVariableCompletions = true;
				}
				else if (section.length > 1 && section[0] == '(') {
					const innards = section.slice(1);
					const balancedParens = extractToMatchingDelimiter(innards, "(", ")");
					if (balancedParens === undefined || (balancedParens == innards || balancedParens + ")" == innards)) {
						returnVariableCompletions = true;
					}
				}
				else if (!/\s/.test(section) || (!/\s/.test(section.slice(0, -1)) && section.slice(-1) == " ")) {
					returnVariableCompletions = true;
				}
			}
			else {
				returnVariableCompletions = true;
			}

			if (returnVariableCompletions)
				completions = generateVariableCompletions(document, position, projectIndex);
		}
	}
	return completions;
}