import {
	TextDocument,
	Position
} from 'vscode-languageserver';

/**
 * Type for a mutable index of identifiers.
 */
export type IdentifierIndex = Map<string, Position>;

/**
 * Type for an immutable index of identifiers.
 */
export type ReadonlyIdentifierIndex = ReadonlyMap<string, Position>;

/**
 * Interface for an index of a ChoiceScript project.
 */
export interface ProjectIndex {
	updateGlobalVariables(newIndex: IdentifierIndex): void;
	updateLocalVariables(textDocument: TextDocument, newIndex: IdentifierIndex): void;
	updateSceneList(scenes: Array<string>): void;
	updateLabels(textDocument: TextDocument, newIndex: IdentifierIndex): void;
	getGlobalVariables(): ReadonlyIdentifierIndex;
	getLocalVariables(textDocument: TextDocument): ReadonlyIdentifierIndex;
	getSceneList(): ReadonlyArray<string>;
	getLabels(textDocument: TextDocument): ReadonlyIdentifierIndex;
	getSceneVariables(scene: string): ReadonlyIdentifierIndex | undefined;
	getSceneLabels(scene: string): ReadonlyIdentifierIndex | undefined;
	removeDocument(textDocument: TextDocument): void;
}

/**
 * Update project index for a document in that project.
 * 
 * @param textDocument Document to index.
 * @param isStartupFile True if the document is the ChoiceScript startup file.
 * @param index Project index to update.
 */
export function updateProjectIndex(textDocument: TextDocument, isStartupFile: boolean, index: ProjectIndex): void {
	let text = textDocument.getText();

	let pattern: RegExp | null = null;
	if (isStartupFile) {
		pattern = /(?<prefix>\n\s*)?\*((?<commandWithValue>create|temp|label)\s+(?<value>\w+)|(?<bareCommand>scene_list)\s*?\r?\n?)/g;
	}
	else {
		// *create is not legal except in startup files
		pattern = /(?<prefix>\n\s*)?\*(?<commandWithValue>temp|label)\s+(?<value>\w+)/g;
	}
	let m: RegExpExecArray | null;

	let newGlobalVariables: IdentifierIndex = new Map();
	let newLocalVariables: IdentifierIndex = new Map();
	let newScenes: Array<string> = [];
	let newLabels: IdentifierIndex = new Map();

	while (m = pattern.exec(text)) {
		if (m.groups === undefined) {
			continue;
		}
		let prefix = m.groups.prefix;
		let commandWithValue: string = m.groups.commandWithValue;
		let value = m.groups.value;
		let bareCommand = m.groups.bareCommand;
		let commandIndex = m.index;
		if (prefix !== undefined) {
			commandIndex += prefix.length;
		}
		let commandPosition: Position = textDocument.positionAt(commandIndex);

		if (!(prefix === undefined && m.index > 0)) {
			if (bareCommand == "scene_list") {
				newScenes = extractScenes(text, pattern.lastIndex);
			}
			else {
				switch (commandWithValue) {
					case "create":
						// *create instantiates global variables
						newGlobalVariables.set(value, commandPosition);
						break;
					case "temp":
						// *temp instantiates variables local to the file
						newLocalVariables.set(value, commandPosition);
						break;
					case "label":
						// *label creates a goto/gosub label local to the file
						newLabels.set(value, commandPosition);
						break;
				}
			}
		}
	}

	if (isStartupFile) {
		index.updateGlobalVariables(newGlobalVariables);
		index.updateSceneList(newScenes);
	}
	index.updateLocalVariables(textDocument, newLocalVariables);
	index.updateLabels(textDocument, newLabels);
}

/**
 * Scan a document's text to find the end of the current line.
 * 
 * @param document Document text to scan.
 * @param startIndex Index at which to begin scan.
 * @returns Index corresponding to one past the line's end, including any \r\n
 */
function getLineEnd(document: string, startIndex: number): number | null {
	let i = startIndex;
	let lineEnd: number | null = null;

	for (let i = startIndex; i < document.length; i++) {
		if (i < document.length - 2 && document[i] == '\r' && document[i+1] == '\n') {
			lineEnd = i+2;
			break;
		}
		if (i < document.length - 1 && document[i] == '\n') {
			lineEnd = i+1;
			break;
		}
		if (i == document.length - 1) {
			lineEnd = i+1;
			break;
		}
	}

	return lineEnd;
}

/**
 * Extract the scenes defined by a *scene_list command.
 * 
 * @param document Document text to scan.
 * @param startIndex Index at the start of the scenes.
 * @returns Array of the scene names, or an empty array if no scene names were found.
 */
function extractScenes(document: string, startIndex: number): Array<string> {
	let sceneList: Array<string> = [];
	let scenePattern = /(\s+)(\$\s+)?(\S+)\s*\r?\n/;
	let lineStart = startIndex;

	// Process the first line to get the indent level and first scene
	let lineEnd = getLineEnd(document, lineStart);
	if (!lineEnd) {
		return sceneList;  // No scene found
	}
	let line = document.slice(lineStart, lineEnd);
	let m = scenePattern.exec(line);
	if (!m) {
		return sceneList;
	}
	let padding = m[1];
	sceneList.push(m[3]);
	lineStart = lineEnd;

	// Now loop as long as the scene pattern matches and the padding is consistent
	while (true) {
		lineEnd = getLineEnd(document, lineStart);
		if (!lineEnd) {
			return sceneList;
		}
		line = document.slice(lineStart, lineEnd);
		m = scenePattern.exec(line);
		if (!m || m[1] != padding) {
			return sceneList;
		}
		sceneList.push(m[3]);
		lineStart = lineEnd;
	}
}