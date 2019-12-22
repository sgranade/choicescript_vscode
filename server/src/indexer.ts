import { Range, Location, TextDocument } from 'vscode-languageserver';

/**
 * Type for a mutable index of identifiers.
 */
export type IdentifierIndex = Map<string, Location>;

/**
 * Type for an immutable index of identifiers.
 */
export type ReadonlyIdentifierIndex = ReadonlyMap<string, Location>;

/**
 * Interface for an index of a ChoiceScript project.
 */
export interface ProjectIndex {
	/**
	 * Update the index of global variables from the startup scene.
	 * @param textDocument startup.txt document.
	 * @param newIndex New index of global variables.
	 */
	updateGlobalVariables(textDocument: TextDocument, newIndex: IdentifierIndex): void;
	/**
	 * Update the index of variables local to a scene.
	 * @param textDocument Document whose index is to be updated.
	 * @param newIndex New index of local variables.
	 */
	updateLocalVariables(textDocument: TextDocument, newIndex: IdentifierIndex): void;
	/**
	 * Update the list of scene names in the project.
	 * @param scenes New list of scene names.
	 */
	updateSceneList(scenes: Array<string>): void;
	/**
	 * Update the index of labels in a scene file.
	 * @param textDocument Document whose index is to be updated.
	 * @param newIndex New index of labels.
	 */
	updateLabels(textDocument: TextDocument, newIndex: IdentifierIndex): void;
	/**
	 * Get the URI to the project's startup.txt file.
	 */
	getStartupFileUri(): string;
	/**
	 * Get global variables in a project.
	 */
	getGlobalVariables(): ReadonlyIdentifierIndex;
	/**
	 * Get list of scenes in the project.
	 */
	getSceneList(): ReadonlyArray<string>;
	/**
	 * Get the local variables in a scene file.
	 * @param textDocument Scene document.
	 */
	getLocalVariables(textDocument: TextDocument): ReadonlyIdentifierIndex;
	/**
	 * Get the local variables in a scene file by the scene's name.
	 * @param scene Name of the scene.
	 */
	getSceneVariables(scene: string): ReadonlyIdentifierIndex | undefined;
	/**
	 * Get the labels in a scene file.
	 * @param textDocument Scene document.
	 */
	getLabels(textDocument: TextDocument): ReadonlyIdentifierIndex;
	/**
	 * Get the labels in a scene file by the scene's name.
	 * @param scene Name of the scene.
	 */
	getSceneLabels(scene: string): ReadonlyIdentifierIndex | undefined;
	/**
	 * Remove a document from the project index.
	 * @param textDocument Document to remove.
	 */
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
		pattern = /(?<prefix>\n\s*)?\*((?<commandWithValue>create|temp|label)(?<spacing>\s+)(?<value>\w+)|(?<bareCommand>scene_list)\s*?\r?\n?)/g;
	}
	else {
		// *create is not legal except in startup files
		pattern = /(?<prefix>\n\s*)?\*(?<commandWithValue>temp|label)(?<spacing>\s+)(?<value>\w+)/g;
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
		let spacing = m.groups.spacing;
		let value = m.groups.value;
		let bareCommand = m.groups.bareCommand;
		let commandIndex = m.index;
		if (prefix !== undefined) {
			commandIndex += prefix.length;
		}
		let valueIndex = 0;
		if (value !== undefined) {
			valueIndex = commandIndex + 1 + commandWithValue.length + spacing.length;
		}

		if (!(prefix === undefined && m.index > 0)) {
			if (bareCommand == "scene_list") {
				newScenes = extractScenes(text, pattern.lastIndex);
			}
			else {
				switch (commandWithValue) {
					case "create":
						// *create instantiates global variables
						newGlobalVariables.set(value, Location.create(textDocument.uri, Range.create(
							textDocument.positionAt(valueIndex),
							textDocument.positionAt(valueIndex + value.length)
							)));
						break;
					case "temp":
						// *temp instantiates variables local to the file
						newLocalVariables.set(value, Location.create(textDocument.uri, Range.create(
							textDocument.positionAt(valueIndex),
							textDocument.positionAt(valueIndex + value.length)
							)));
						break;
					case "label":
						// *label creates a goto/gosub label local to the file
						newLabels.set(value, Location.create(textDocument.uri, Range.create(
							textDocument.positionAt(valueIndex),
							textDocument.positionAt(valueIndex + value.length)
							)));
						break;
				}
			}
		}
	}

	if (isStartupFile) {
		index.updateGlobalVariables(textDocument, newGlobalVariables);
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