import {
	type Position,
	Range,
	type Location,
	TextEdit,
	type CompletionItem,
	CompletionItemKind
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { ProjectIndex, IdentifierIndex, ReadonlyIdentifierIndex, ReadonlyLabelIndex, LabelIndex, ReadonlyAchievementIndex } from "./index";
import { validCommandsCompletions, startupCommandsCompletions, uriIsStartupFile } from './language';
import { extractToMatchingDelimiter, comparePositions, normalizeUri, positionInRange, iteratorMap, iteratorFilter } from './utilities';

function generateCompletionsFromArray(array: readonly string[],
	kind: CompletionItemKind, dataDescription: string): CompletionItem[] {
	return array.map((x: string) => ({
		label: x,
		kind: kind,
		data: dataDescription
	}));
}

function generateCompletionsFromIndex(
	index: ReadonlyIdentifierIndex | IdentifierIndex | ReadonlyLabelIndex | LabelIndex | ReadonlyAchievementIndex,
	kind: CompletionItemKind, dataDescription: string): CompletionItem[] {
	return Array.from(iteratorMap(index.keys(), (x: string) => ({
		label: x,
		kind: kind,
		data: dataDescription
	})));
}

/**
 * Generate completions for variables.
 * @param documentUri Document URI. (Normalize before calling!)
 * @param position Cursor position in the document.
 * @param projectIndex Index of project contents.
 * @returns Completion items.
 */
function generateVariableCompletions(documentUri: string, position: Position, projectIndex: ProjectIndex): CompletionItem[] {
	// Only offer local variables that have been created, taking into account subroutine-defined variables
	const origLocalVariables = projectIndex.getLocalVariables(documentUri);
	const localVariables = new Map(origLocalVariables);
	for (const [variable, location] of projectIndex.getSubroutineLocalVariables(documentUri).entries()) {
		const existingLocations = Array.from(localVariables.get(variable) ?? []);
		existingLocations.push(location);
		localVariables.set(variable, existingLocations);
	}
	const keysToKeys = origLocalVariables.caseInsensitiveKeysToKeys();
	const finalLocalVariables = new Map();
	for (const [key, value] of localVariables) {
		finalLocalVariables.set(keysToKeys.get(key) ?? key, value);
	}

	const availableVariablesGenerator = iteratorFilter(finalLocalVariables.entries(), ([variable, locations]: [string, readonly Location[]]) => {  // eslint-disable-line @typescript-eslint/no-unused-vars
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

	completions.push(...Array.from(iteratorMap(projectIndex.getGlobalVariables().caseInsensitiveKeysToKeys().values(), (x: string) => ({
		label: x,
		kind: CompletionItemKind.Variable,
		data: "variable-global"
	}))));

	let includeAchievements = false;
	for (const scope of projectIndex.getDocumentScopes(documentUri).achievementVarScopes) {
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
	const documentUri = normalizeUri(document.uri);
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
				if (uriIsStartupFile(documentUri)) {
					completions.push(...startupCommandsCompletions);
				}
			}
			else {
				switch (tokens[0]) {
					case "gosub":
						// Complete variables
						if (tokens.length > 2) {
							completions = generateVariableCompletions(documentUri, position, projectIndex);
							break;
						}
						// Fall through to the goto
					case "goto":
						if (tokens.length == 2) {
							completions = generateCompletionsFromIndex(projectIndex.getLabels(documentUri), CompletionItemKind.Reference, "labels-local");
						}
						break;

					case "gosub_scene":
						// Complete variables
						if (tokens.length > 3) {
							completions = generateVariableCompletions(documentUri, position, projectIndex);
							break;
						}
						// Fall through to the goto_scene
					case "goto_scene":
						if (tokens.length == 2) {
							completions = generateCompletionsFromArray(projectIndex.getIndexedScenes(), CompletionItemKind.Reference, "scenes");
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
						completions = generateVariableCompletions(documentUri, position, projectIndex);
						break;

					case "create":
					case "temp":
						if (tokens.length > 2) {
							completions = generateVariableCompletions(documentUri, position, projectIndex);
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
				completions = generateVariableCompletions(documentUri, position, projectIndex);
		}
	}
	return completions;
}